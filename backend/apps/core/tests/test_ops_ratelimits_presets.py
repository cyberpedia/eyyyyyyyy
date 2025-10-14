from __future__ import annotations

import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.conf import settings
from rest_framework.test import APIClient


User = get_user_model()


class OpsRateLimitPresetsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="staff", email="s@example.com", password="strongpassword123")
        self.user.is_staff = True
        self.user.save()
        # login
        self.client.post("/api/auth/login", {"username": "staff", "password": "strongpassword123"}, format="json")

    def test_get_presets_default(self):
        # Ensure file doesn't exist
        path = Path(settings.RATE_LIMIT_PRESETS_PATH)
        if path.exists():
            path.unlink()
        r = self.client.get("/api/ops/rate-limits/presets")
        self.assertEqual(r.status_code, 200)
        self.assertIn("presets", r.data)
        self.assertIn("env_presets", r.data)

    def test_update_presets_valid(self):
        cfg = {
            "presets": {
                "competition": {
                    "flag-submit": {"user_rate": "9/min", "ip_rate": "25/min"},
                    "login": {"user_rate": "", "ip_rate": "4/min"},
                }
            },
            "env_presets": {
                "prod": {
                    "flag-submit": {"user_rate": "11/min", "ip_rate": "35/min"},
                    "login": {"user_rate": "", "ip_rate": "6/min"},
                }
            },
        }
        r = self.client.post("/api/ops/rate-limits/presets", cfg, format="json")
        self.assertEqual(r.status_code, 200)
        # File should exist
        path = Path(settings.RATE_LIMIT_PRESETS_PATH)
        self.assertTrue(path.exists())
        with path.open("r") as f:
            saved = json.load(f)
        self.assertEqual(saved["presets"]["competition"]["flag-submit"]["user_rate"], "9/min")

    def test_update_presets_invalid_rate(self):
        bad = {"presets": {"p": {"flag-submit": {"user_rate": "bad", "ip_rate": "1/min"}}}, "env_presets": {}}
        r = self.client.post("/api/ops/rate-limits/presets", bad, format="json")
        self.assertEqual(r.status_code, 400)