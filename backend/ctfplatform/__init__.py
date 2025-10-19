from .celery import app as celery_app

__all__ = ("celery_app",)

# Optional Sentry integration
import os
try:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    dsn = os.getenv("SENTRY_DSN")
    if dsn:
        sentry_sdk.init(
            dsn=dsn,
            integrations=[DjangoIntegration()],
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
            send_default_pii=False,
        )
except Exception:
    # Sentry optional; ignore initialization errors
    pass