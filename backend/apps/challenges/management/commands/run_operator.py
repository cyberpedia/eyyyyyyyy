from __future__ import annotations

import time
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.challenges.models import TeamServiceInstance


class Command(BaseCommand):
    help = "Run a simple operator loop to reconcile TeamServiceInstance resources (dev mode)."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=int, default=10, help="Reconcile interval seconds (default: 10)")

    def handle(self, *args, **options):
        interval = options["interval"]
        self.stdout.write(self.style.WARNING(f"Starting operator loop (dev mode) with interval {interval}s"))
        try:
            while True:
                # Reconcile pending instances: mark running and set dummy endpoint
                pendings = TeamServiceInstance.objects.filter(status=TeamServiceInstance.STATUS_PENDING)[:50]
                for inst in pendings:
                    inst.status = TeamServiceInstance.STATUS_RUNNING
                    inst.endpoint_url = f"http://team-{inst.team_id}.example.local/{inst.challenge.slug}"
                    inst.last_check_at = timezone.now()
                    inst.save(update_fields=["status", "endpoint_url", "last_check_at"])
                    self.stdout.write(self.style.SUCCESS(f"Started instance id={inst.id} team={inst.team_id} url={inst.endpoint_url}"))

                # Reconcile stopped instances: clear endpoint
                stoppeds = TeamServiceInstance.objects.filter(status=TeamServiceInstance.STATUS_STOPPED)[:50]
                for inst in stoppeds:
                    inst.endpoint_url = ""
                    inst.last_check_at = timezone.now()
                    inst.save(update_fields=["endpoint_url", "last_check_at"])
                    self.stdout.write(self.style.WARNING(f"Stopped instance id={inst.id}"))

                time.sleep(interval)
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Operator loop stopped."))