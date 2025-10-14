from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.challenges.models import Category, Tag, Challenge, hmac_flag


class Command(BaseCommand):
    help = "Seed demo data: categories, tags, and a sample challenge."

    def handle(self, *args, **options):
        web, _ = Category.objects.get_or_create(slug="web", defaults={"name": "Web"})
        crypto, _ = Category.objects.get_or_create(slug="crypto", defaults={"name": "Crypto"})
        forensics, _ = Category.objects.get_or_create(slug="forensics", defaults={"name": "Forensics"})

        easy_tag, _ = Tag.objects.get_or_create(name="easy")
        warmup_tag, _ = Tag.objects.get_or_create(name="warmup")

        chal, created = Challenge.objects.get_or_create(
            slug="basic-web",
            defaults={
                "title": "Basic Web",
                "description": "Find the flag on this simple web page.",
                "category": web,
                "scoring_model": Challenge.SCORING_STATIC,
                "points_min": 50,
                "points_max": 500,
                "k": 0.018,
                "is_dynamic": False,
                "released_at": timezone.now(),
                "flag_hmac": hmac_flag("CTF{demo}"),
            },
        )
        chal.tags.add(easy_tag, warmup_tag)

        if created:
            self.stdout.write(self.style.SUCCESS("Created sample challenge 'basic-web'"))
        else:
            self.stdout.write(self.style.WARNING("Sample challenge 'basic-web' already exists"))

        self.stdout.write(self.style.SUCCESS("Seed complete."))