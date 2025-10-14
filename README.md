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

Docs
- System Design v1.1: docs/system-design.md
- ERD (PlantUML): docs/erd.puml
- OpenAPI (draft): docs/openapi.yaml
- Project Plan: docs/project-plan.md
- Kubernetes CRDs (draft):
  - docs/k8s/crds/challenge-template-crd.yaml
  - docs/k8s/crds/challenge-instance-crd.yaml

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

Frontend (Next.js)
- Location: frontend/
- Minimal scaffold with App Router and Tailwind.
- Talks to backend at http://localhost:8000/api

CI
- GitHub Actions runs basic Django checks.