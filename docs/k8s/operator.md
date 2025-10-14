# Kubernetes Operator (Challenge Instances)

This repository includes a basic Python/Django management command acting as a Kubernetes operator to reconcile custom resources into Deployments and Services.

CRDs
- docs/k8s/crds/challenge-template-crd.yaml
- docs/k8s/crds/challenge-instance-crd.yaml

Command
- docker compose exec backend python manage.py run_k8s_operator --namespace your-namespace --interval 15

Behavior
- Lists ChallengeInstance CRs in the target namespace.
- Reads the referenced ChallengeTemplate for container image and resource requirements.
- Ensures a Deployment and Service are created for each instance.
- Patches CR status with phase, URL, and message.
- Syncs instance info into Django TeamServiceInstance entries, linking by team and challenge.

Assumptions
- The ChallengeInstance `spec.owner` includes `teamId` and `eventId`.
- ChallengeTemplate `metadata.name` is used as a reference (templateRef) and is assumed to match a Challenge slug in Django for linking.
- Services expose HTTP on port 8080 within the cluster; the operator sets URL to http://<name>.<namespace>.svc.cluster.local:8080.

Production notes
- This command is a simplified operator suitable for dev/staging. For production:
  - Consider using a dedicated operator framework (e.g., Kopf, Operator SDK).
  - Implement drift detection and updates (image/resources/env changes).
  - Implement deletion handling (terminate Deployment/Service when instance is removed).
  - Implement ingress or per-team exposure if needed.
  - Add security controls, namespaces per event, and network profiles based on templates.
  - Add TTL cleanup and idle shutdown based on template `idleTimeoutMinutes`.

Configuration
- Environment variables:
  - OPERATOR_NAMESPACE (default "default")
  - OPERATOR_INTERVAL (seconds; default 15)

Troubleshooting
- Ensure KUBECONFIG is available or the command is running in-cluster with proper RBAC.
- Check Kubernetes API permissions for CustomObjectsApi, AppsV1Api, and CoreV1Api.