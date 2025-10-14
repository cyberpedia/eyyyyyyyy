from __future__ import annotations

from rest_framework.throttling import SimpleRateThrottle


class PerIPRateThrottle(SimpleRateThrottle):
    """
    A per-IP throttle that supports per-view scoped rates.

    Usage:
    - Add to view.throttle_classes alongside ScopedRateThrottle.
    - Set view.throttle_scope = "foo".
    - Configure DEFAULT_THROTTLE_RATES["foo-ip"] = "10/min" in settings.
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