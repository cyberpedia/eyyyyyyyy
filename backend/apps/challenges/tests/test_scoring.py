from __future__ import annotations

from math import isclose

from django.test import TestCase
from django.utils import timezone

from apps.challenges.models import Challenge, Category, hmac_flag


class DynamicScoringTests(TestCase):
    def setUp(self):
        self.web = Category.objects.create(name="Web", slug="web")
        self.chal = Challenge.objects.create(
            title="Dyn",
            slug="dyn",
            description="dyn",
            category=self.web,
            scoring_model=Challenge.SCORING_DYNAMIC,
            points_min=50,
            points_max=500,
            k=0.018,
            is_dynamic=False,
            released_at=timezone.now(),
            flag_hmac=hmac_flag("CTF{dyn}"),
        )

    def test_scoring_decreases_with_solves(self):
        p0 = self.chal.current_points(0)
        p10 = self.chal.current_points(10)
        p100 = self.chal.current_points(100)
        self.assertGreaterEqual(p0, p10)
        self.assertGreaterEqual(p10, p100)
        self.assertGreaterEqual(p0, p100)
        self.assertGreaterEqual(p100, self.chal.points_min)

    def test_min_floor_enforced(self):
        p1k = self.chal.current_points(1000)
        self.assertGreaterEqual(p1k, self.chal.points_min)
        self.assertEqual(p1k, max(self.chal.points_min, p1k))