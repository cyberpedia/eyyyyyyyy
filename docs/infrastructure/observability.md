# Observability

This repository ships optional instrumentation for metrics and error reporting, plus health/readiness endpoints for Kubernetes.

Endpoints
- Health: GET /api/healthz → { "status": "ok" }
- Readiness: GET /api/readiness → { "status": "ready" }
- Metrics: GET /api/metrics → Prometheus exposition format (text/plain)

Metrics (Prometheus)
- ctf_flag_submissions_total{correct="true|false"} — total flag submissions
- ctf_ad_defense_uptime_ticks_total — total AD defense uptime ticks awarded
- ctf_ad_attack_success_total — total successful attack events
- ctf_koth_hold_ticks_total — total KotH hold ticks awarded

Setup
- Add prometheus-client to backend requirements (already added).
- Scrape /api/metrics via your Prometheus configuration.
  - Example ServiceMonitor (if using kube-prometheus-stack):

    apiVersion: monitoring.coreos.com/v1
    kind: ServiceMonitor
    metadata:
      name: ctf-backend
      namespace: your-namespace
    spec:
      selector:
        matchLabels:
          app.kubernetes.io/component: backend
      endpoints:
        - port: http
          path: /api/metrics
          interval: 30s

Sentry (optional)
- Add environment variable SENTRY_DSN to enable Sentry error reporting.
- Optional: SENTRY_TRACES_SAMPLE_RATE (default 0.0) to enable performance tracing.
- Initialization is in backend/ctfplatform/__init__.py with DjangoIntegration.

Dashboards and Alerts
- Create Grafana dashboards for:
  - Flag submissions (correct ratio)
  - AD defense uptime ticks per minute
  - AD attack success rate
  - KotH hold tick rate
- Alerts:
  - Backend /api/healthz failing (availability SLO)
  - Metrics scrape failing (collector issues)
  - Sudden drop in defense uptime ticks (instance health issues)

Notes
- You can extend metrics to include per-challenge labels if needed. Be mindful of cardinality.
- Health/readiness endpoints are minimal; consider adding DB and cache checks for readiness in production.