from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Team, Membership, ScoreEvent

User = get_user_model()


class LeaderboardTieTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Teams
        self.t1 = Team.objects.create(name="alpha", slug="alpha")
        self.t2 = Team.objects.create(name="bravo", slug="bravo")
        self.t3 = Team.objects.create(name="charlie", slug="charlie")

        # Scores: t1=100, t2=100, t3=50
        ScoreEvent.objects.create(team=self.t1, delta=100, type=ScoreEvent.TYPE_BONUS)
        ScoreEvent.objects.create(team=self.t2, delta=100, type=ScoreEvent.TYPE_BONUS)
        ScoreEvent.objects.create(team=self.t3, delta=50, type=ScoreEvent.TYPE_BONUS)

    def test_dense_ranking(self):
        r = self.client.get("/api/leaderboard")
        self.assertEqual(r.status_code, 200)
        rows = r.data["results"]
        # Expect order alpha (100), bravo (100), charlie (50) with ranks 1,1,2 (dense ranking)
        self.assertEqual([row["team_name"] for row in rows], ["alpha", "bravo", "charlie"])
        self.assertEqual([row["rank"] for row in rows], [1, 1, 2])