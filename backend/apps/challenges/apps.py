from django.apps import AppConfig


class ChallengesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.challenges"

    def ready(self):
        # Register signals for AD/KotH broadcasting
        from . import signals  # noqa: F401