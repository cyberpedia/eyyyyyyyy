from __future__ import annotations

import os
import kopf
from kubernetes import config, client
from kubernetes.client import ApiException

GROUP = "infra.ctf.example.com"
VERSION = "v1alpha1"
TPL_PLURAL = "challengetemplates"
INST_PLURAL = "challengeinstances"


def _load_kube():
    try:
        config.load_incluster_config()
    except Exception:
        config.load_kube_config()


def _apps():
    return client.AppsV1Api()


def _core():
    return client.CoreV1Api()


def _co():
    return client.CustomObjectsApi()


def _desired_deployment(name: str, namespace: str, image: str, cpu: str | None, mem: str | None, env: dict[str, str]) -> client.V1Deployment:
    labels = {"app": name}
    container = client.V1Container(
        name=name,
        image=image,
        ports=[client.V1ContainerPort(container_port=8080)],
        env=[client.V1EnvVar(name=k, value=v) for k, v in env.items()],
        resources=client.V1ResourceRequirements(
            limits={"cpu": cpu, "memory": mem} if cpu or mem else None,
            requests={"cpu": cpu, "memory": mem} if cpu or mem else None,
        ),
    )
    pod = client.V1PodSpec(containers=[container])
    tmpl = client.V1PodTemplateSpec(
        metadata=client.V1ObjectMeta(labels=labels),
        spec=pod,
    )
    spec = client.V1DeploymentSpec(
        replicas=1,
        selector=client.V1LabelSelector(match_labels=labels),
        template=tmpl,
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


def _env_for_instance(body: dict) -> dict[str, str]:
    owner = body.get("spec", {}).get("owner", {})
    return {
        "TEAM_ID": str(owner.get("teamId", "")),
        "EVENT_ID": str(owner.get("eventId", "")),
    }


@kopf.on.startup()
def configure(settings: kopf.OperatorSettings, **_):
    _load_kube()
    # Reduce watch reconnect noise
    settings.watching.connect_timeout = 60
    settings.watching.server_timeout = 300


@kopf.on.create(GROUP, VERSION, INST_PLURAL)
@kopf.on.update(GROUP, VERSION, INST_PLURAL)
def reconcile_instance(spec, name, namespace, status, logger, **kwargs):
    """
    Reconcile ChallengeInstance -> Deployment + Service and update CR status.
    """
    coapi = _co()
    apps = _apps()
    core = _core()

    tpl_name = spec.get("templateRef")
    owner = spec.get("owner", {})
    if not tpl_name:
        raise kopf.TemporaryError("templateRef is required", delay=30)

    # Read template to get image/resources
    tpl = coapi.get_namespaced_custom_object(GROUP, VERSION, namespace, TPL_PLURAL, tpl_name)
    image = tpl["spec"]["image"]
    resources = tpl["spec"].get("resources", {}) or {}
    cpu = resources.get("cpu")
    mem = resources.get("memory")
    env = _env_for_instance({"spec": spec})

    # Ensure Deployment
    try:
        apps.read_namespaced_deployment(name, namespace)
    except ApiException as e:
        if e.status == 404:
            dep = _desired_deployment(name, namespace, image, cpu, mem, env)
            apps.create_namespaced_deployment(namespace, dep)
            logger.info(f"Created Deployment {name}")

    # Ensure Service
    try:
        core.read_namespaced_service(name, namespace)
    except ApiException as e:
        if e.status == 404:
            svc = _desired_service(name, namespace)
            core.create_namespaced_service(namespace, svc)
            logger.info(f"Created Service {name}")

    # Update status
    url = f"http://{name}.{namespace}.svc.cluster.local:8080"
    new_status = {
        "phase": "Ready",
        "namespace": namespace,
        "url": url,
        "message": "Provisioned",
    }
    try:
        coapi.patch_namespaced_custom_object_status(GROUP, VERSION, namespace, INST_PLURAL, name, {"status": new_status})
    except ApiException:
        pass

    # Sync into Django via optional webhook (future)
    # For now, operator focuses on K8s resources & CR status.


@kopf.on.delete(GROUP, VERSION, INST_PLURAL)
def delete_instance(spec, name, namespace, logger, **kwargs):
    """
    Clean up resources on instance deletion.
    """
    apps = _apps()
    core = _core()
    # Best-effort cleanup
    try:
        apps.delete_namespaced_deployment(name, namespace)
    except ApiException:
        pass
    try:
        core.delete_namespaced_service(name, namespace)
    except ApiException:
        pass
    logger.info(f"Deleted resources for instance {name}")