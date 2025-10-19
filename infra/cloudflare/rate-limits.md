# Cloudflare Rate-Limiting Templates

This guide provides example configurations for applying per-path rate limits on the CTF backend using Cloudflare's Rulesets (WAF).

Options:
- Use Cloudflare Dashboard to create rules (simple).
- Use Terraform to manage rules as code (recommended).
- Use Cloudflare API to create rules programmatically.

## 1) Ruleset (WAF) via Terraform

```hcl
# Requires: cloudflare provider configured with zone_id
# Limits:
# - /api/auth/login: 5 requests per minute per IP
# - /api/challenges/*/submit: 10 requests per minute per IP

resource "cloudflare_ruleset" "http_ratelimit" {
  zone_id = var.zone_id
  name    = "ctf-rate-limits"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules {
    enabled     = true
    description = "Limit login attempts"
    expression  = "(http.request.uri.path eq \"/api/auth/login\")"
    action      = "block"
    ratelimit {
      characteristics = ["ip.src"]
      period          = 60
      requests_per_period = 5
      mitigation_timeout   = 60
    }
  }

  rules {
    enabled     = true
    description = "Limit flag submissions"
    # Matches any /api/challenges/{id}/submit
    expression  = "starts_with(http.request.uri.path, \"/api/challenges/\") and ends_with(http.request.uri.path, \"/submit\")"
    action      = "block"
    ratelimit {
      characteristics = ["ip.src"]
      period          = 60
      requests_per_period = 10
      mitigation_timeout   = 60
    }
  }
}
```

## 2) Rules via Cloudflare Dashboard (manual)

- Go to Security → WAF → Rate limiting rules.
- Create rule "Limit login attempts":
  - If URI Path equals /api/auth/login
  - Rate limit: 5 requests per minute per IP
  - Action: Block (or Managed Challenge)
- Create rule "Limit flag submissions":
  - If URI Path starts with /api/challenges/ and ends with /submit
  - Rate limit: 10 requests per minute per IP
  - Action: Block

## 3) Rules via API (example JSON payloads)

```json
{
  "description": "Limit login attempts",
  "action": "block",
  "ratelimit": {
    "characteristics": ["ip.src"],
    "period": 60,
    "requests_per_period": 5,
    "mitigation_timeout": 60
  },
  "expression": "(http.request.uri.path eq \"/api/auth/login\")",
  "enabled": true
}
```

```json
{
  "description": "Limit flag submissions",
  "action": "block",
  "ratelimit": {
    "characteristics": ["ip.src"],
    "period": 60,
    "requests_per_period": 10,
    "mitigation_timeout": 60
  },
  "expression": "starts_with(http.request.uri.path, \"/api/challenges/\") and ends_with(http.request.uri.path, \"/submit\")",
  "enabled": true
}
```

Notes:
- Consider "managed_challenge" action for login attempts to reduce false positives.
- Pair with Bot Fight Mode, Super Bot Fight Mode (Pro+), and additional WAF heuristics.
- Keep Cloudflare limits coherent with app-level limits to avoid excessive 429/403 during peak events.