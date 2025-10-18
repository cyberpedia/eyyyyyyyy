from __future__ import annotations

import getpass

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create or update a Django superuser (interactive or via flags)."

    def add_arguments(self, parser):
        parser.add_argument("--username", type=str, help="Admin username")
        parser.add_argument("--email", type=str, help="Admin email")
        parser.add_argument("--password", type=str, help="Admin password (use with caution)")

    def handle(self, *args, **options):
        User = get_user_model()
        username = options.get("username")
        email = options.get("email")
        password = options.get("password")

        if not username:
            username = input("Username: ").strip()
        if not email:
            email = input("Email: ").strip()
        if not password:
            pw1 = getpass.getpass("Password (min 12 chars): ")
            pw2 = getpass.getpass("Confirm password: ")
            if pw1 != pw2:
                raise CommandError("Passwords do not match.")
            password = pw1

        if len(password) < 12:
            raise CommandError("Password too short. Must be at least 12 characters.")

        user, created = User.objects.get_or_create(username=username, defaults={"email": email})
        user.email = email
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created superuser '{username}'"))
        else:
            self.stdout.write(self.style.WARNING(f"Updated existing superuser '{username}'"))