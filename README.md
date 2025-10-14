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

Ops (Rate limits viewer)
- Frontend page: http://localhost:3000/ops/rate-limits (requires staff user in session)
- Presets:
  - Competition mode: flag-submit 10/min user + 30/min IP; login 5/min IP
  - Practice mode: flag-submit 30/min user + 60/min IP; login 30/min IP
- Backend API:
  - GET http://localhost:8000/api/ops/rate-limits → view defaults, DB overrides, effective values, cache state
  - POST http://localhost:8000/api/ops/rate-limits → upsert override {scope, user_rate, ip_rate}; blank values clear override. CSRF required.
  - DELETE http://localhost:8000/api/ops/rate-limits?scope=<scope> → remove override row for scope. CSRF required.
  - POST http://localhost:8000/api/ops/rate-limits/cache → clear all rate-limit caches (or pass {scope} to clear one). CSRF required.
- Edge rate-limit templates:
  - Cloudflare: infra/cloudflare/rate-limits.md

Frontend (Next.js)
- Location: frontend/
- Minimal scaffold with App Router and Tailwind.
- Talks to backend at http://localhost:8000/api

CI
- GitHub Actions runs checks, migrations, and tests.