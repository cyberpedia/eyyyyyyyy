# Rate Limiting Options

This project applies rate limiting at two layers:

1) Application-level (Django REST Framework)
- Throttles:
  - DynamicScopedRateThrottle (per-user or per-IP for anonymous)
  - PerIPRateThrottle (explicit per-IP bucket)
- Scopes and defaults (in ctfplatform/settings.py):
  - flag-submit: 10/min (per user)
  - flag-submit-ip: 30/min (per IP)
  - login: 5/min (per IP)
  - login-ip: 5/min (per IP)
- DB overrides:
  - Admin > Rate limit configs
  - Model apps.core.RateLimitConfig allows updating `user_rate` and `ip_rate` per scope at runtime.
  - Cached for ~60s to avoid DB hot path.
- Ops viewer & API:
  - Frontend: /ops/rate-limits
  - Backend: GET/POST /api/ops/rate-limits (staff-only)
- Presets configuration:
  - File: backend/config/rate_limit_presets.json (checked-in; editable via Ops UI)
  - API: GET/POST /api/ops/rate-limits/presets (staff-only)

2) Edge-level (Ingress/Proxy)
- NGINX Ingress (Kubernetes)
  - See infra/k8s/ingress/nginx-ingress-rate-limits.yaml for a template using limit_req zones.
  - Use snippet-based rate-limits per location or global `limit-rps`/`limit-burst`.
- Envoy (local rate limit filter)
  - Example snippet:
    ```yaml
    static_resources:
      listeners:
        - name: listener_http
          address:
            socket_address: { address: 0.0.0.0, port_value: 8080 }
          filter_chains:
            - filters:
                - name: envoy.filters.network.http_connection_manager
                  typed_config:
                    "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                    stat_prefix: ingress_http
                    route_config:
                      name: local_route
                      virtual_hosts:
                        - name: backend
                          domains: ["*"]
                          routes:
                            - match: { prefix: "/api/auth/login" }
                              typed_per_filter_config:
                                envoy.filters.http.local_ratelimit:
                                  "@type": type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
                                  stat_prefix: login_ratelimit
                                  token_bucket: { max_tokens: 5, tokens_per_fill: 5, fill_interval: 60s }
                              route:
                                cluster: django
                            - match: { prefix: "/api/challenges/" }
                              typed_per_filter_config:
                                envoy.filters.http.local_ratelimit:
                                  "@type": type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
                                  stat_prefix: submit_ratelimit
                                  token_bucket: { max_tokens: 10, tokens_per_fill: 10, fill_interval: 60s }
                              route:
                                cluster: django
                    http_filters:
                      - name: envoy.filters.http.local_ratelimit
                        typed_config:
                          "@type": type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
                          stat_prefix: global_ratelimit
                          token_bucket: { max_tokens: 20, tokens_per_fill: 20, fill_interval: 1s }
                      - name: envoy.filters.http.router
    ```
- Cloudflare (WAF/rulesets)
  - Use WAF rules to rate-limit specific paths, e.g. /api/auth/login and /api/challenges/*/submit.
  - Template examples are provided under infra/cloudflare/rate-limits.md.
  - Pair with Bot Fight Mode and JS challenge for suspicious traffic.

Best practices
- Always enforce throttling at application layer (authenticated context aware) and edge layer (cheap per-IP).
- Monitor 429 rates and adjust burst/rates for fairness during peak contest moments.
- Keep app and edge limits coherent to avoid undue errors (edge stricter ⇒ app rarely reached).