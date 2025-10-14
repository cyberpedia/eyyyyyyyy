from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import RateLimitConfig

User = get_user_model()


class OpsRateLimitsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="staff", email="s@example.com", password="strongpassword123")
        self.user.is_staff = True
        self.user.save()
        # login
        self.client.post("/api/auth/login", {"username": "staff", "password": "strongpassword123"}, format="json")

    def test_permissions_required(self):
        anon = APIClient()
        r = anon.get("/api/ops/rate-limits")
        self.assertEqual(r.status_code, 403)

    def test_get_payload_structure(self):
        r = self.client.get("/api/ops/rate-limits")
        self.assertEqual(r.status_code, 200)
        self.assertIn("defaults", r.data)
        self.assertIn("db_overrides", r.data)
        self.assertIn("effective", r.data)
        self.assertIn("cache", r.data)

    def test_update_valid_rates(self):
        cache.clear()
        r = self.client.post(
            "/api/ops/rate-limits",
            {"scope": "flag-submit", "user_rate": "2/min", "ip_rate": "3/min"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        # DB updated
        cfg = RateLimitConfig.objects.get(scope="flag-submit")
        self.assertEqual(cfg.user_rate, "2/min")
        self.assertEqual(cfg.ip_rate, "3/min")
        # Effective reflects overrides
        self.assertEqual(r.data["effective"]["flag-submit"]["user_rate"], "2/min")
        self.assertEqual(r.data["effective"]["flag-submit"]["ip_rate"], "3/min")
        # Cache warmed
        self.assertEqual(cache.get("ratelimit:flag-submit:user"), "2/min")
        self.assertEqual(cache.get("ratelimit:flag-submit:ip"), "3/min")

    def test_update_invalid_rate_format(self):
        r = self.client.post(
            "/api/ops/rate-limits",
            {"scope": "login", "user_rate": "abc", "ip_rate": "5/min"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("invalid user_rate", r.data["detail"])

    def test_delete_override(self):
        RateLimitConfig.objects.update_or_create(scope="flag-submit", defaults={"user_rate": "2/min", "ip_rate": "3/min"})
        cache.set("ratelimit:flag-submit:user", "2/min", 60)
        cache.set("ratelimit:flag-submit:ip", "3/min", 60)
        r = self.client.delete("/api/ops/rate-limits?scope=flag-submit", format="json")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(RateLimitConfig.objects.filter(scope="flag-submit").exists())
        self.assertIsNone(cache.get("ratelimit:flag-submit:user"))
        self.assertIsNone(cache.get("ratelimit:flag-submit:ip"))

    def test_clear_cache(self):
        cache.set("ratelimit:login:user", "5/min", 60)
        cache.set("ratelimit:login:ip", "5/min", 60)
        r = self.client.post("/api/ops/rate-limits/cache", {}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(cache.get("ratelimit:login:user"))
        self.assertIsNone(cache.get("ratelimit:login:ip"))