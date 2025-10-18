# Project Plan and Milestones

Status: Approved
Timeframe: ~13–17 weeks (adjust by team size and parallelization)

## Principles
- Ship vertical slices (auth → submit → see points) to get feedback early.
- Keep risk front-loaded (auth, submissions, scoring, rate limits, audit) before flashy UI.
- Define acceptance criteria and demo artifacts for each milestone.

---

## Milestone 1 — Core Game Loop (3–4 weeks)

Scope:
- Auth (django-allauth), session auth end-to-end
- 2FA mandatory for Admin/Moderator; optional for others
- Teams and membership (captain transfer, invites)
- Challenges CRUD (admin) with categories/tags and release scheduling
- Submissions with HMAC flags; unique correct solve per team/challenge
- Scoring (static + dynamic formula)
- Leaderboard (cached)
- Edge + app rate limiting
- Audit log v1 (append-only, hash-chained)
- Content pages (rules/FAQ/home) basic
- Basic admin pages for CRUD and settings

Acceptance:
- Demo: register/login, join/create team, solve sample challenge, see points and leaderboard update
- Security: rate limit enforced for submissions and login
- Audit: admin actions and submissions visible in audit viewer
- Docs: OpenAPI stub and ERD checked in

Deliverables:
- Django project/apps scaffolding
- Minimal Next.js app with essential pages
- Redis + Postgres + S3 integration
- Tests: unit tests for scoring, submissions, and auth
- Dashboards: initial Prometheus scrape and health metrics

---

## Milestone 2 — Realtime + Content & Moderation (3 weeks)

Scope:
- WebSockets via Channels
- Live activity feed and personal notifications
- Write-up submission + moderation workflow; bonus awarded after approval
- Scoreboard freeze + snapshot view
- Announcements broadcast
- Content management editor (TipTap/Markdown) with sanitization

Acceptance:
- Demo: live feed updates on solves; write-up submission → approve → bonus applied; freeze mode hides rank deltas
- Tests: Channels consumer tests; write-up moderation tests

Deliverables:
- Realtime event bus and feed UI
- Admin moderation queue
- Snapshot creation and public retrieval
- Content editor page; sanitization validated with XSS tests

---

## Milestone 3 — Dynamic Infra (4–6 weeks)

Scope:
- Celery-based provisioner using K8s API
- Per-team instances with per-instance flags
- NetworkPolicies, securityContext hardening, resource limits
- Web terminal (xterm.js) bridging to k8s exec
- Instance metrics and auto-idle reaper
- Resource dashboard for admins

Acceptance:
- Demo: start/stop instance; terminal access; metrics visible; idle termination works
- Security: containers run non-root, read-only FS, dropped capabilities; no lateral pod traffic
- Observability: instance metrics and events in Grafana/Loki

Deliverables:
- Provisioner code and templates
- Terminal gateway via Channels
- Admin infra dashboard
- Runbooks for isolation and emergency stop
- K8s manifests/Helm values for policies

---

## Milestone 4 — Hardening, Scale, and Polish (3–4 weeks)

Scope:
- Full observability (Prometheus/Grafana/Loki), OTel traces on critical flows
- Backups/WAL, restore drill report
- i18n scaffolding + a11y pass
- Import/export (CTFd compatible)
- DB partitioning for Submissions
- Performance and load tests; DDoS posture
- Feature flags for staged rollout

Acceptance:
- Demo: restore drill; load test results; feature flag toggles
- Security review passed; lint/type/security scans clean
- Documentation: runbooks and ops guides updated

Deliverables:
- Helm chart skeleton and env values
- Performance test scripts
- Security review checklist sign-off

---

## Risks and Mitigations
- Submission spikes: edge+app rate limits, Redis-backed counters, cached leaderboard
- Provisioning failures: retry/backoff, quotas, controller alerts
- Data growth: partitioning and archiving policies
- Abuse from challenge containers: strict policies, separate namespaces/cluster, egress control

---

## Team and Roles (suggested)
- Tech Lead (backend focus)
- Frontend Engineer
- Infra/DevOps Engineer
- Security/QA Engineer
- Part-time Designer (UI polish, a11y)

---

## Definition of Done (global)
- Tests updated and passing (unit + integration)
- Security scans (Bandit, Trivy, pip-audit) clean or accepted
- Observability in place (metrics/logs/traces for new features)
- Docs updated (OpenAPI, runbooks, README links)