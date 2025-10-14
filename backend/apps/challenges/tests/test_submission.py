from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Team, Membership, ScoreEvent
from apps.challenges.models import Category, Challenge, hmac_flag

User = get_user_model()


class SubmissionFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="alice", email="a@example.com", password="verysecurepass")
        self.client.post("/api/auth/login", {"username": "alice", "password": "verysecurepass"}, format="json")
        self.team = Team.objects.create(name="alpha", slug="alpha", captain=self.user)
        Membership.objects.create(user=self.user, team=self.team, role=Membership.ROLE_CAPTAIN)
        self.web = Category.objects.create(name="Web", slug="web")
        self.challenge = Challenge.objects.create(
            title="Sample",
            slug="sample",
            description="desc",
            category=self.web,
            scoring_model=Challenge.SCORING_STATIC,
            points_min=50,
            points_max=500,
            k=0.018,
            is_dynamic=False,
            released_at=timezone.now(),
            flag_hmac=hmac_flag("CTF{demo}"),
        )

    def test_incorrect_then_correct_submission_and_first_blood(self):
        # Incorrect
        r = self.client.post(f"/api/challenges/{self.challenge.id}/submit", {"flag": "CTF{nope}"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["correct"], False)

        # Correct
        r = self.client.post(f"/api/challenges/{self.challenge.id}/submit", {"flag": "CTF{demo}"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["correct"], True)
        # First blood bonus included
        self.assertEqual(r.data["points_awarded"], 500 + round(500 * 0.10))

        # Team score should reflect both events
        self.team.refresh_from_db()
        expected_total = sum(e.delta for e in ScoreEvent.objects.filter(team=self.team))
        self.assertEqual(self.team.score, expected_total)
        self.assertEqual(self.team.score, 500 + round(500 * 0.10))

    def test_flag_submit_throttle(self):
        # Hit throttle by sending 11 requests (rate is 10/min per user)
        for i in range(10):
            r = self.client.post(f"/api/challenges/{self.challenge.id}/submit", {"flag": "CTF{nope}"}, format="json")
            self.assertEqual(r.status_code, 200)
        r = self.client.post(f"/api/challenges/{self.challenge.id}/submit", {"flag": "CTF{nope}"}, format="json")
        self.assertEqual(r.status_code, 429)


class LoginThrottleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="bob", email="b@example.com", password="goodpassword")

    def test_login_throttle_per_ip(self):
        for i in range(5):
            r = self.client.post("/api/auth/login", {"username": "bob", "password": "wrong"}, format="json")
            self.assertIn(r.status_code, (200, 401))  # wrong creds return 401
        r = self.client.post("/api/auth/login", {"username": "bob", "password": "wrong"}, format="json")
        self.assertEqual(r.status_code, 429)