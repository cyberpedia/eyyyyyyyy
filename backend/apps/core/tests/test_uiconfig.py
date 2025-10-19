from __future__ import annotations

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.models import UiConfig
from apps.challenges.models import Category, Tag, Event


class UiConfigApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_get_default(self):
        resp = self.client.get("/api/ui/config")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("challenge_list_layout", data)
        self.assertIn(data["challenge_list_layout"], dict(UiConfig.LAYOUT_CHOICES).keys())

    def test_post_invalid_layout(self):
        # Need staff user; for simplicity, mark request as staff via force_authenticate? Using DRF APIClient doesn't have user.
        # Instead, temporarily bypass with creating superuser and logging in.
        from django.contrib.auth import get_user_model

        User = get_user_model()
        admin = User.objects.create_user(username="admin", email="a@a", password="password-strong-123456", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=admin)

        resp = self.client.post("/api/ui/config", {"challenge_list_layout": "invalid"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_post_category_override(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        admin = User.objects.create_user(username="admin2", email="b@b", password="password-strong-123456", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=admin)

        cat = Category.objects.create(name="Web", slug="web")
        payload = {"challenge_list_layout": "grid", "layout_by_category": {"web": "masonry"}}
        resp = self.client.post("/api/ui/config", payload, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["challenge_list_layout"], "grid")
        self.assertEqual(data["layout_by_category"].get("web"), "masonry")

    def test_post_tag_override(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        admin = User.objects.create_user(username="admin3", email="c@c", password="password-strong-123456", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=admin)

        Tag.objects.create(name="Crypto")
        payload = {"layout_by_tag": {"Crypto": "list"}}
        resp = self.client.post("/api/ui/config", payload, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["layout_by_tag"].get("Crypto"), "list")

    def test_post_event_override(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        admin = User.objects.create_user(username="admin6", email="f@f", password="password-strong-123456", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=admin)

        Event.objects.create(name="CTF Finals", slug="ctf-finals")
        payload = {"layout_by_event": {"ctf-finals": "grid"}}
        resp = self.client.post("/api/ui/config", payload, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["layout_by_event"].get("ctf-finals"), "grid")

    def test_post_unknown_category(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        admin = User.objects.create_user(username="admin4", email="d@d", password="password-strong-123456", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=admin)

        payload = {"layout_by_category": {"unknown": "grid"}}
        resp = self.client.post("/api/ui/config", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_post_unknown_tag(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        admin = User.objects.create_user(username="admin5", email="e@e", password="password-strong-123456", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=admin)

        payload = {"layout_by_tag": {"NoSuchTag": "grid"}}
        resp = self.client.post("/api/ui/config", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_post_untagged_special(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        admin = User.objects.create_user(username="admin8", email="h@h", password="password-strong-123456", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=admin)

        payload = {"layout_by_tag": {"(Untagged)": "list"}}
        resp = self.client.post("/api/ui/config", payload, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["layout_by_tag"].get("(Untagged)"), "list")

    def test_post_unknown_event(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        admin = User.objects.create_user(username="admin7", email="g@g", password="password-strong-123456", is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=admin)

        payload = {"layout_by_event": {"unknown-event": "grid"}}
        resp = self.client.post("/api/ui/config", payload, format="json")
        self.assertEqual(resp.status_code, 400)