from __future__ import annotations

import hashlib
import hmac
from math import exp
from typing import Optional

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.models import Team, ScoreEvent

User = get_user_model()


def hmac_flag(flag: str) -> str:
    normalized = (flag or "").strip()
    return hmac.new(
        key=settings.FLAG_HMAC_PEPPER.encode("utf-8"),
        msg=normalized.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()


class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)

    def __str__(self) -> str:
        return self.name


class Tag(models.Model):
    name = models.CharField(max_length=120, unique=True)

    def __str__(self) -> str:
        return self.name


class Challenge(models.Model):
    SCORING_STATIC = "static"
    SCORING_DYNAMIC = "dynamic"
    SCORING_CHOICES = [(SCORING_STATIC, "Static"), (SCORING_DYNAMIC, "Dynamic")]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField()
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    tags = models.ManyToManyField(Tag, blank=True)
    scoring_model = models.CharField(max_length=12, choices=SCORING_CHOICES, default=SCORING_STATIC)
    points_min = models.IntegerField(default=50)
    points_max = models.IntegerField(default=500)
    k = models.FloatField(default=0.018)
    is_dynamic = models.BooleanField(default=False)
    released_at = models.DateTimeField(null=True, blank=True)
    flag_hmac = models.CharField(max_length=64)  # sha256 hex
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=["slug"])]

    def __str__(self) -> str:
        return self.title

    def current_points(self, solves_count: Optional[int] = None) -> int:
        if self.scoring_model == self.SCORING_STATIC:
            return self.points_max
        if solves_count is None:
            solves_count = Submission.objects.filter(challenge=self, is_correct=True).count()
        pts = int(settings.MIN_POINTS_FLOOR + (self.points_max - settings.MIN_POINTS_FLOOR) * exp(-self.k * solves_count))
        return max(self.points_min, pts)


class Submission(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="submissions")
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="submissions")
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="submissions")
    is_correct = models.BooleanField(default=False)
    flag_prefix = models.CharField(max_length=16, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["team", "challenge"],
                condition=Q(is_correct=True),
                name="uniq_correct_solve_per_team_challenge",
            )
        ]
        indexes = [models.Index(fields=["challenge", "-created_at"]), models.Index(fields=["team", "-created_at"])]

    def __str__(self) -> str:
        return f"Sub#{self.id} team={self.team_id} chal={self.challenge_id} correct={self.is_correct}"


def verify_flag(challenge: Challenge, submitted_flag: str) -> bool:
    return hmac.compare_digest(hmac_flag(submitted_flag), challenge.flag_hmac)