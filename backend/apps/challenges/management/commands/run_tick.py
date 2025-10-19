from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.challenges.models import Challenge
from apps.challenges.tasks import run_tick


class Command(BaseCommand):
    help = "Trigger a tick for a given challenge (for AD/KotH modes)."

    def add_arguments(self, parser):
        parser.add_argument("challenge_id", type=int, help="Challenge ID")
        parser.add_argument("--tick", type=int, default=1, help="Tick index (default: 1)")

    def handle(self, *args, **options):
        cid = options["challenge_id"]
        tick = options["tick"]
        try:
            c = Challenge.objects.get(id=cid)
        except Challenge.DoesNotExist:
            raise CommandError(f"Challenge {cid} not found")
        self.stdout.write(self.style.WARNING(f"Dispatching tick {tick} for challenge {cid} ({c.mode})"))
        run_tick.delay(cid, tick)
        self.stdout.write(self.style.SUCCESS("Tick dispatched."))