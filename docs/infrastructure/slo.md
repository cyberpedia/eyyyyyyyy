# SLOs (Target Service Levels)

The following Service Level Objectives are suggested for the CTF platform:

Availability
- Backend API (healthz): 99.9% monthly
- WebSocket connectivity (leaderboard, AD/KotH): 99.5% monthly

Latency (p95)
- Flag submission POST: ≤ 300 ms (excluding network)
- Leaderboard GET: ≤ 200 ms
- AD token submit POST: ≤ 300 ms
- KotH status GET: ≤ 200 ms

Error rates
- 5xx error rate: ≤ 0.1%

Capacity
- Concurrency: sized for N concurrent users (configure based on event size)
- WebSocket connections: sized for N live sockets concurrently

Monitoring & Alerts
- Alerts on:
  - healthz failures > 1 minute
  - metrics scrape failures > 5 minutes
  - spike in 5xx rate > 0.5% over 5 minutes
  - p95 latency exceeding targets for 10 minutes

Review cadence
- Review SLO compliance post-event and adjust targets based on learnings.