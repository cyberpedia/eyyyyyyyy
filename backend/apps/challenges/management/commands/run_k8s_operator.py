from __future__ import annotations

import os
import time
from typing import Dict, Any

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings

from kubernetes import client, config
from kubernetes.client import ApiException

from apps.challenges.models import TeamServiceInstance


GROUP = "infra.ctf.example.com"
VERSION = "v1alpha1"
TPL_PLURAL = "challengetemplates"
INST_PLURAL = "challengeinstances"


def _load_kube_config():
    # Prefer in-cluster, fall back to local kubeconfig
    try:
        config.load_incluster_config()
    except Exception:
        config.load_kube_config()


def _get_coapi():
    return client.CustomObjectsApi()


def _get_apps_api():
    return client.AppsV1Api()


def _get_core_api():
    return client.CoreV1Api()


def _desired_deployment(name: str, namespace: str, image: str, resources: Dict[str, str], env: Dict[str, str]) -> client.V1Deployment:
    labels = {"app": name}
    container = client.V1Container(
        name=name,
        image=image,
        ports=[client.V1ContainerPort(container_port=8080)],
        env=[client.V1EnvVar(name=k, value=v) for k, v in env.items()],
        resources=client.V1ResourceRequirements(
            limits={"cpu": resources.get("cpu"), "memory": resources.get("memory")},
            requests={"cpu": resources.get("cpu"), "memory": resources.get("memory")},
        ),
    )
    pod_spec = client.V1PodSpec(containers=[container])
    template = client.V1PodTemplateSpec(
        metadata=client.V1ObjectMeta(labels=labels),
        spec=pod_spec,
    )
    spec = client.V1DeploymentSpec(
        replicas=1,
        selector=client.V1LabelSelector(match_labels=labels),
        template=template,
    )
    return client.V1Deployment(
        api_version="apps/v1",
        kind="Deployment",
        metadata=client.V1ObjectMeta(name=name, labels=labels),
        spec=spec,
    )


def _desired_service(name: str, namespace: str) -> client.V1Service:
    labels = {"app": name}
    spec = client.V1ServiceSpec(
        selector=labels,
        ports=[client.V1ServicePort(port=8080, target_port=8080, protocol="TCP")],
        type="ClusterIP",
    )
    return client.V1Service(
        api_version="v1",
        kind="Service",
        metadata=client.V1ObjectMeta(name=name, labels=labels),
        spec=spec,
    )


def _env_for_instance(inst: Dict[str, Any]) -> Dict[str, str]:
    # Add per-instance environment vars (team/event ids)
    owner = inst["spec"]["owner"]
    env = {
        "TEAM_ID": str(owner["teamId"]),
        "EVENT_ID": str(owner["eventId"]),
    }
    # Merge global env from settings if desired
    return env


class Command(BaseCommand):
    help = "Run a Kubernetes operator reconciling ChallengeInstance CRs into Deployments/Services and syncing with Django TeamServiceInstance rows."

    def add_arguments(self, parser):
        parser.add_argument("--namespace", default=os.getenv("OPERATOR_NAMESPACE", "default"))
        parser.add_argument("--interval", type=int, default=int(os.getenv("OPERATOR_INTERVAL", "15")))

    def handle(self, *args, **options):
        namespace = options["namespace"]
        interval = options["interval"]
        self.stdout.write(self.style.WARNING(f"Starting k8s operator in namespace={namespace} interval={interval}s"))
        _load_kube_config()
        coapi = _get_coapi()
        apps_api = _get_apps_api()
        core_api = _get_core_api()

        while True:
            try:
                instances = coapi.list_namespaced_custom_object(
                    GROUP, VERSION, namespace, INST_PLURAL
                ).get("items", [])
                for inst in instances:
                    name = inst["metadata"]["name"]
                    spec = inst["spec"]
                    tpl_ref = spec["templateRef"]
                    owner = spec["owner"]
                    # Read template to get image/resources
                    tpl = coapi.get_namespaced_custom_object(GROUP, VERSION, namespace, TPL_PLURAL, tpl_ref)
                    image = tpl["spec"]["image"]
                    resources = tpl["spec"].get("resources", {})
                    env = _env_for_instance(inst)
                    # Ensure Deployment
                    try:
                        apps_api.read_namespaced_deployment(name, namespace)
                        # TODO: update if drift detected
                    except ApiException as e:
                        if e.status == 404:
                            dep = _desired_deployment(name, namespace, image, resources, env)
                            apps_api.create_namespaced_deployment(namespace, dep)
                            self.stdout.write(self.style.SUCCESS(f"Created Deployment {name}"))
                    # Ensure Service
                    try:
                        core_api.read_namespaced_service(name, namespace)
                    except ApiException as e:
                        if e.status == 404:
                            svc = _desired_service(name, namespace)
                            core_api.create_namespaced_service(namespace, svc)
                            self.stdout.write(self.style.SUCCESS(f"Created Service {name}"))
                    # Update CR status (ready)
                    status = {
                        "phase": "Ready",
                        "namespace": namespace,
                        "url": f"http://{name}.{namespace}.svc.cluster.local:8080",
                        "message": "Provisioned",
                    }
                    try:
                        coapi.patch_namespaced_custom_object_status(
                            GROUP, VERSION, namespace, INST_PLURAL, name, {"status": status}
                        )
                    except ApiException:
                        pass
                    # Sync into Django TeamServiceInstance
                    try:
                        team_id = owner["teamId"]
                        from apps.challenges.models import Challenge, TeamServiceInstance
                        chal = Challenge.objects.filter(slug=tpl_ref).first()
                        if chal:
                            obj, _ = TeamServiceInstance.objects.update_or_create(
                                team_id=team_id,
                                challenge=chal,
                                defaults={
                                    "status": TeamServiceInstance.STATUS_RUNNING,
                                    "endpoint_url": status["url"],
                                    "last_check_at": timezone.now(),
                                },
                            )
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"Sync error: {e}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Operator loop error: {e}"))

            time.sleep(interval)