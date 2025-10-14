# CTF Platform

System design and initial scaffold for the CTF platform.

Quickstart (dev)
- Prereqs: Docker, Docker Compose, Node 18+, Python 3.12 (optional if not using Docker).
- Start backend + Postgres + Redis:
  - docker-compose up --build
  - Backend: http://localhost:8000/api
- Start frontend:
  - cd frontend && npm install && npm run dev
  - Frontend: http://localhost:3000
- Seed demo data (categories + sample challenge):
  - docker compose exec backend python manage.py migrate
  - docker compose exec backend python manage.py seed_demo
- Create admin (interactive or flags):
  - docker compose exec backend python manage.py create_admin
  - or docker compose exec backend python manage.py create_admin --username admin --email you@example.com --password 'strong_password_here'

Docs
- System Design v1.1: docs/system-design.md
- ERD (PlantUML): docs/erd.puml
- OpenAPI (draft): docs/openapi.yaml
- Project Plan: docs/project-plan.md
- Kubernetes CRDs (draft):
  - docs/k8s/crds/challenge-template-crd.yaml
  - docs/k8s/crds/challenge-instance-crd.yaml
- Rate-limiting overview:
  - docs/infrastructure/rate-limits.md
- NGINX Ingress rate limits (template):
  - infra/k8s/ingress/nginx-ingress-rate-limits.yaml
- Envoy local rate-limit (example):
  - infra/envoy/local-rate-limit.yaml

Backend (Django)
- Location: backend/
- Commands:
  - pip install -r backend/requirements.txt
  - python backend/manage.py migrate
  - python backend/manage.py createsuperuser
  - python backend/manage.py runserver 0.0.0.0:8000
- Env (docker-compose default):
  - POSTGRES_HOST=db, POSTGRES_DB=ctf, POSTGRES_USER=ctf, POSTGRES_PASSWORD=ctf
  - REDIS_URL=redis://redis:6379/1, FLAG_HMAC_PEPPER=dev-pepper-change-me
- Notes:
  - Submissions use HMAC flags with constant-time compare.
  - First blood awards +10% of max points.
  - Leaderboard is derived from ScoreEvents.
  - App-level rate limiting enabled (DB-overridable via Admin > Rate limit configs):
    - Flag submission: 10/min per user + 30/min per IP (429 on exceed)
    - Login: 5/min per IP
  - Real-time:
    - WebSocket at ws://localhost:8000/ws/leaderboard pushes live leaderboard updates on score events.

Content and Moderation
- Write-ups:
  - Submit write-ups on challenge pages; they enter a moderation queue.
  - Rendered as Markdown with syntax highlighting on the challenge page (sanitized).
  - Ops UI (staff): http://localhost:3000/ops/writeups for moderation (approve/reject with notes).
  - Audit trail: view per write-up and export to CSV from the Ops UI (includes notes and status changes).
  - API:
    - GET http://localhost:8000/api/content/challenges/<challenge_id>/writeups?status=approved
    - POST http://localhost:8000/api/content/challenges/<challenge_id>/writeups (auth required; CSRF)
    - GET http://localhost:8000/api/content/writeups?status=pending (staff-only)
    - POST http://localhost:8000/api/content/writeups/<id>/moderate (staff-only; body: {action: approve|reject, notes})
    - GET http://localhost:8000/api/content/writeups/<id>/audit (staff-only; JSON audit trail)
    - GET http://localhost:8000/api/content/writeups/<id>/audit.csv (staff-only; CSV export)
  - Bonus points:
    - Approved write-ups award WRITEUP_BONUS_POINTS to the author’s team (default 25; configurable via env).
- Frozen challenge snapshots:
  - Admin can snapshot a challenge’s current state for freeze/moderation history:
    - POST http://localhost:8000/api/admin/challenges/<id>/snapshot (body: {reason: freeze|moderation|manual})

Ops (Rate limits viewer)
- Frontend page: http://localhost:3000/ops/rate-limits (requires staff user in session)
- Role badges shown in UI (Staff, Superuser)
- Presets:
  - Competition mode: flag-submit 10/min user + 30/min IP; login 5/min IP
  - Practice mode: flag-submit 30/min user + 60/min IP; login 30/min IP
  - Heavy load mode: flag-submit 20/min user + 100/min IP; login 15/min IP
- Environment presets (suggested defaults; apply per environment):
  - Dev: flag-submit 120/min user + 240/min IP; login 60/min IP
  - Staging: flag-submit 30/min user + 60/min IP; login 15/min IP
  - Prod: flag-submit 10/min user + 30/min IP; login 5/min IP
- Presets config (editable by ops/admin without code changes):
  - UI editor on the Ops page (visible to superusers; staff can view/apply presets)
  - File: backend/config/rate_limit_presets.json
  - API:
    - GET/POST http://localhost:8000/api/ops/rate-limits/presets (POST requires superuser)
    - POST http://localhost:8000/api/ops/rate-limits/presets/validate (staff-only; returns {valid, errors})
- Dry-run preview:
  - Preview buttons show a diff of current vs new user/IP rates per scope before applying
- Backend API:
  - GET http://localhost:8000/api/ops/rate-limits → view defaults, DB overrides, effective values, cache state
  - POST http://localhost:8000/api/ops/rate-limits → upsert override {scope, user_rate, ip_rate}; blank values clear override. CSRF required.
  - DELETE http://localhost:8000/api/ops/rate-limits?scope=<scope> → remove override row for scope. CSRF required.
  - POST http://localhost:8000/api/ops/rate-limits/cache → clear all rate-limit caches (or pass {scope} to clear one). CSRF required.
- Edge rate-limit templates:
  - Cloudflare: infra/cloudflare/rate-limits.md

Ops (Settings)
- Frontend page: http://localhost:3000/ops/settings
- Manage UI theme (light/dark) and code highlighting theme (light/dark)
- Clear persisted filters/preferences stored in browser for Ops pages:
  - Rate-limits: auto-refresh toggle and interval
  - Write-ups: status filter, challenge ID, page, page size

Frontend (Next.js)
- Location: frontend/
- Minimal scaffold with App Router and Tailwind.
- Dev proxy: Next.js rewrites /api/* to the Django backend (http://localhost:8000/api). Use relative paths like /api/auth/login so session cookies stay on the frontend origin and are available to server-side guards.
- Server-side guard: all /ops pages are protected by a server layout that checks /api/users/me before rendering and redirects to /login if not staff.
- Leaderboard page connects to WebSocket for live updates.

CI
- GitHub Actions runs checks, migrations, and tests.

Environment variables
- WRITEUP_BONUS_POINTS: points awarded to a team when a member’s write-up is approved (default 25).