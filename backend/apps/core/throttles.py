from __future__ import annotations

from django.core.cache import cache
from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle, ScopedRateThrottle

try:
    # Local import to avoid migrations-order issues in settings import
    from .models import RateLimitConfig
except Exception:  # pragma: no cover - during early import/migration
    RateLimitConfig = None  # type: ignore


def _get_db_rate(scope: str, suffix: str | None) -> str | None:
    """
    Retrieve a DB-configured rate for a given scope.
    suffix: None for user, "ip" for per-IP.
    Returns a DRF rate string like "10/min" or None if not configured.
    """
    if not RateLimitConfig:
        return None
    cache_key = f"ratelimit:{scope}:{suffix or 'user'}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None  # empty string -> None
    try:
        cfg = RateLimitConfig.objects.only("user_rate", "ip_rate").get(scope=scope)
    except RateLimitConfig.DoesNotExist:
        cache.set(cache_key, "", 60)
        return None
    rate = cfg.ip_rate if suffix == "ip" else cfg.user_rate
    cache.set(cache_key, rate or "", 60)
    return rate or None


class DynamicScopedRateThrottle(ScopedRateThrottle):
    """
    Scoped throttle that can read its rate from DB (RateLimitConfig) or fall back to settings.
    """

    def get_rate(self):
        scope = getattr(self, "scope", None)
        if not scope:
            return None
        db_rate = _get_db_rate(scope, None)
        if db_rate:
            return db_rate
        return super().get_rate()


class PerIPRateThrottle(SimpleRateThrottle):
    """
    A per-IP throttle that supports per-view scoped rates and DB overrides.

    Usage:
    - Add to view.throttle_classes alongside DynamicScopedRateThrottle.
    - Set view.throttle_scope = "foo".
    - Configure DB RateLimitConfig (scope='foo') ip_rate OR
      DEFAULT_THROTTLE_RATES["foo-ip"] in settings.
    """

    def get_cache_key(self, request, view):
        scope = getattr(view, "throttle_scope", None)
        if not scope:
            return None
        # Look up rate under "<scope>-ip"
        self.scope = f"{scope}-ip"
        ident = self.get_ident(request)
        if ident is None:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}

    def get_rate(self):
        # self.scope has already been set to "<scope>-ip" in get_cache_key
        scope = getattr(self, "scope", None)
        if not scope:
            return None
        base_scope = scope[:-3] if scope.endswith("-ip") else scope
        db_rate = _get_db_rate(base_scope, "ip")
        if db_rate:
            return db_rate
        # fallback to DRF settings via parent implementation
        return super().get_rate()