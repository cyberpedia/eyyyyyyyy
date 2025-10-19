# CTF Platform System Design v1.1 (All suggestions approved)

Status: Approved baseline
Owner: Platform Engineering
Last updated: 2025-10-14

## Decision summary (approved)
- Frontend: Next.js (App Router) + React; Tailwind CSS + shadcn/ui; TanStack Query; React Hook Form + Zod; TipTap editor (Markdown storage fallback acceptable).
- Backend: Django + DRF + Channels; Redis (cache + channel layer); Celery + Redis/RabbitMQ.
- DB: PostgreSQL; S3-compatible object storage for attachments.
- Realtime: WebSockets via Django Channels (not Socket.IO).
- Auth: django-allauth; DRF SimpleJWT only for CLI/mobile; session auth for browser; mandatory 2FA for Admin/Moderator; optional WebAuthn for Admins.
- Rate limiting: Edge (Cloudflare) + App-level (django-ratelimit/DRF throttles with Redis).
- Content: Markdown or TipTap JSON; server-side sanitization (bleach).
- Write-ups: Moderator approval required; bonus awarded post-approval; public archive.
- Dynamic challenges: Phase 1 Celery provisioner using K8s API; Phase 2 CRD + controller. Separate namespaces now; option for separate cluster later.
- Terminal access: Web terminal (xterm.js) bridged to Kubernetes exec; avoid SSH in containers.
- Flags: Per-instance HMAC flags for dynamic; no plaintext flags persisted; constant-time verification.
- Audit: Append-only, hash-chained; daily sealed root hash to S3 with Object Lock.
- Submissions scaling: Partition by event_id and month; strategic indexes.
- Import/export: CTFd-compatible import/export (limited scope).
- Practice mode: Non-event sandbox that does not impact main leaderboard.
- Feature flags: django-flags.
- Privacy/i18n/a11y: Baseline WCAG AA and i18n scaffolding; privacy self-serve export/delete; retention windows.

---

## 1. Overview

This document specifies the architecture, data model, APIs, scoring, realtime flows, dynamic provisioning, observability, security controls, and delivery phases for a modern CTF platform.

Non-goals for Phase 1: KoTH/AWD modes, multi-region active-active.

---

## 2. Architecture

### 2.1 High-level components
- Web UI (Next.js): Public site + Admin SPA
- API (Django + DRF): REST; session auth for browser; JWT only for CLI/mobile
- Realtime Gateway (Channels): WebSockets for notifications, feeds, terminals
- Background Jobs (Celery): provisioning, emails, write-up moderation, scoring recomputes
- Cache/Channels (Redis): caching, throttles, pub/sub
- Database (PostgreSQL): normalized schema, partitions
- Object Storage (S3): attachments, write-up images
- Provisioner: Celery workers using Kubernetes API
- Observability: Prometheus, Grafana, Loki, OpenTelemetry

### 2.2 Networking and edge
- Cloudflare: CDN, WAF, TLS termination (optionally pass-through), edge rate limits
- K8s Ingress (Nginx): mTLS internal services, per-path limits, sticky sessions for WebSockets

### 2.3 Environments
- Dev, Staging, Prod; separate K8s namespaces per env; challenge workloads in dedicated namespaces; optional separate cluster for challenges.

---

## 3. Data model

See ERD: docs/erd.puml

Key entities:
- User, Team, Membership, Event
- Category, Challenge, Tag, ChallengeTagMap, Hint, Attachment, Dependency
- Submission, ScoreEvent, LeaderboardSnapshot
- WriteUp
- InstanceTemplate, Instance
- Notification
- AuditLog
- ContentPage

Indexes/constraints highlights:
- Unique correct solve per (team_id, challenge_id)
- Partition Submission by (event_id, month)
- Challenge unique (event_id, slug)
- Team unique slug
- First-blood enforced by transactional lock on Challenge row + ordered index on Submission(correct=true)

---

## 4. API surface

OpenAPI spec: docs/openapi.yaml

Principles:
- REST with predictable nouns and HTTP verbs
- Server-side pagination, filtering, and ETags on list endpoints
- Rate limits per endpoint class; stricter on submissions/login
- Session auth for browser; CSRF protection enabled
- JWT for CLI/mobile only (short TTL + refresh rotation)

Representative endpoints:
- Auth: register, login, logout, 2FA enable/verify, token refresh
- Users/Teams: profile, invites, membership
- Challenges: list, detail, submit flag, unlock hint, write-ups
- Leaderboard: live and snapshots; freeze support
- Instances: start/stop, metrics; WS for terminal
- Admin: challenges, tags, users, teams, events/settings, write-ups moderation, instances/templates, audit log

---

## 5. Scoring and rules

### 5.1 Static scoring
- Fixed points per challenge; hints reduce award at solve time.

### 5.2 Dynamic scoring
Formula:
points = floor(min_points + (max_points - min_points) * exp(-k * solves))

Defaults:
- max_points: 500
- min_points: 50
- Target ~150 points at 100 solves → k ≈ 0.018

Notes:
- Recompute on each correct Submission
- Persist ScoreEvents for deltas
- Enforce floor at min_points

### 5.3 Bonuses and penalties
- First blood: +10% of max_points (rounded)
- Hint costs: Deduct from award when solved (sum of used)
- Write-up bonus: Fixed or percentage after moderator approval (single award per team/challenge)

### 5.4 Freeze
- Leaderboard freezes at freeze_at; continue logging Submissions; serve snapshot for public views until finalization.

---

## 6. Realtime and notifications

WebSocket channels:
- /ws/public: solve feed, announcements, leaderboard deltas (obey freeze)
- /ws/user: per-user notifications (instance ready, invites)
- /ws/admin: telemetry, moderation events

Event emission:
- Submissions and ScoreEvents publish to Redis pub/sub; Channels relays to users with sampling to avoid floods.

---

## 7. Dynamic challenge provisioning

Phase 1 (Celery-based):
1) API enqueues start_instance(team, challenge)
2) Worker:
   - generate unique flag; store HMAC; create K8s Secret
   - create Pod/Deployment with securityContext:
     - runAsNonRoot, readOnlyRootFilesystem, drop capabilities, seccomp, AppArmor
     - resource requests/limits; ephemeral storage limits
   - apply NetworkPolicy (no pod-to-pod, restricted egress)
   - wait for readiness; emit instance_ready event
3) Idle reaper terminates after N minutes inactivity; metrics collected periodically

Terminal access:
- Browser xterm.js ↔ WS ↔ Channels ↔ Kubernetes exec
- Short-lived signed token; strict RBAC; audit session start/stop

Phase 2 (CRD-based):
- ChallengeTemplate and ChallengeInstance CRDs (docs/k8s/crds/*.yaml)
- Controller reconciles desired state; declarative, auditable, scalable

---

## 8. Security

### 8.1 Flag handling
- HMAC(pepper, normalized_flag); constant-time compare
- Per-instance flags via K8s Secret env var; platform never stores plaintext
- Log only safe prefix (e.g., first 6 chars) of submitted flags

### 8.2 Input/output hardening
- Sanitize rich content with bleach; strict allowlist; disallow inline JS
- File uploads: size/type limits; server-side AV scan (ClamAV); store in S3 with private ACL + presigned URLs
- CSP, HSTS, modern TLS; secure cookies; referrer policy; frame deny

### 8.3 Abuse prevention
- Edge + app rate limiting; exponential backoff
- CAPTCHA after threshold on sensitive endpoints
- Duplicate account heuristics for moderation; no auto-bans

### 8.4 Secrets and isolation
- KMS-encrypted K8s Secrets; optional Vault
- Strict NetworkPolicies; minimal RBAC
- Separate namespaces (platform vs challenges); optional separate cluster

### 8.5 Audit
- Append-only, hash-chained; daily seal root hash to S3 (Object Lock); retention policy

---

## 9. Observability

- Metrics: request latency, submissions/sec, solves/sec, ws_connections, cache hit ratio; instance_count, CPU/mem, provision latency
- Logs: structured JSON with request_id, user_id/team_id; Loki labels include event_id/instance_id
- Traces: OpenTelemetry spans for submit, start_instance, terminal connect
- Dashboards: Event health, queue depth, instance telemetry, solve distribution

---

## 10. Admin UX

- Status controls: start/end/freeze, announcements
- Challenges: CRUD, tags, dependencies, schedule, preview
- Moderation: write-ups queue, suspicious activity, verification
- Instances: per-team/challenge views; start/stop; resource usage; auto-idle config
- Analytics: solves by hour/category, hint usage, time-to-first-solve; CSV export
- Audit: filterable/searchable; saved views

---

## 11. Delivery plan

See docs/project-plan.md

Milestones:
1) Core loop (auth, teams, challenges, submissions, scoring, leaderboard, admin)
2) Realtime + content (feeds, notifications, write-ups, freeze, snapshots)
3) Dynamic infra (provisioner, terminal, metrics, idle reaper)
4) Hardening and scale (observability, backups, i18n/a11y, import/export, partitioning, performance/security)

---

## 12. Runbooks (initial)
- Restore DB from backups: WAL replay procedure; RPO/RTO targets
- Rotating JWT/CSRF/session secrets; redeploy order
- K8s emergency isolation: block egress, freeze instance controller
- Incident response: contact tree, evidence collection, logs snapshot to S3 (Object Lock)
- DDoS posture: switch Cloudflare to “Under Attack,” raise ingress limits, disable costly feeds

---

## 13. OpenAPI, ERD, and CRDs

- OpenAPI: docs/openapi.yaml
- ERD (PlantUML): docs/erd.puml
- K8s CRDs: docs/k8s/crds/challenge-template-crd.yaml, docs/k8s/crds/challenge-instance-crd.yaml

---

## 14. Future work
- Game modes (KoTH/AWD)
- Plugins for custom scoring badges
- WebAuthn as default 2FA for all users
- Multi-region HA; read replicas for analytics