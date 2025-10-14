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

    MODE_JEOPARDY = "JEOPARDY"
    MODE_ATTACK_DEFENSE = "ATTACK_DEFENSE"
    MODE_KOTH = "KOTH"
    MODE_CHOICES = [
        (MODE_JEOPARDY, "Jeopardy"),
        (MODE_ATTACK_DEFENSE, "Attack-Defense"),
        (MODE_KOTH, "King of the Hill"),
    ]

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

    # Multi-mode support
    mode = models.CharField(max_length=32, choices=MODE_CHOICES, default=MODE_JEOPARDY)
    tick_seconds = models.PositiveIntegerField(default=60)
    instance_required = models.BooleanField(default=False)
    checker_config = models.JSONField(default=dict, blank=True)

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


class ChallengeSnapshot(models.Model):
    REASON_FREEZE = "freeze"
    REASON_MODERATION = "moderation"
    REASON_MANUAL = "manual"
    REASON_CHOICES = [
        (REASON_FREEZE, "Freeze"),
        (REASON_MODERATION, "Moderation"),
        (REASON_MANUAL, "Manual"),
    ]

    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="snapshots")
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220)
    description = models.TextField()
    scoring_model = models.CharField(max_length=12)
    points_min = models.IntegerField()
    points_max = models.IntegerField()
    k = models.FloatField()
    is_dynamic = models.BooleanField()
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    reason = models.CharField(max_length=16, choices=REASON_CHOICES, default=REASON_MANUAL)

    class Meta:
        indexes = [models.Index(fields=["challenge", "-created_at"])]

    def __str__(self) -> str:
        return f"Snapshot {self.id} of {self.challenge_id} ({self.reason})"


# --- Attack-Defense and KotH models ---

class TeamServiceInstance(models.Model):
    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_ERROR = "error"
    STATUS_STOPPED = "stopped"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_RUNNING, "Running"),
        (STATUS_ERROR, "Error"),
        (STATUS_STOPPED, "Stopped"),
    ]

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="service_instances")
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="service_instances")
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_PENDING)
    endpoint_url = models.URLField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    last_check_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["challenge", "team"])]

    def __str__(self) -> str:
        return f"Inst {self.id} team={self.team_id} chal={self.challenge_id} status={self.status}"


class DefenseToken(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="defense_tokens")
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="defense_tokens")
    instance = models.ForeignKey(TeamServiceInstance, null=True, blank=True, on_delete=models.SET_NULL)
    tick = models.BigIntegerField()
    token = models.CharField(max_length=128)  # random token (optionally HMAC)
    minted_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()

    class Meta:
        indexes = [
            models.Index(fields=["challenge", "team", "tick"]),
            models.Index(fields=["token"]),
        ]

    def __str__(self) -> str:
        return f"Token chal={self.challenge_id} team={self.team_id} tick={self.tick}"


class AttackEvent(models.Model):
    attacker_team = models.ForeignKey(Team, related_name="attacks", on_delete=models.CASCADE)
    victim_team = models.ForeignKey(Team, related_name="victim_attacks", on_delete=models.CASCADE)
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="attack_events")
    tick = models.BigIntegerField()
    token_hash = models.CharField(max_length=128)
    points_awarded = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=["challenge", "-created_at"])]

    def __str__(self) -> str:
        return f"Attack {self.id} {self.attacker_team_id} -> {self.victim_team_id} ({self.points_awarded})"


class OwnershipEvent(models.Model):
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="ownership_events")
    owner_team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="koth_ownerships")
    from_ts = models.DateTimeField()
    to_ts = models.DateTimeField(null=True, blank=True)
    points_awarded = models.IntegerField(default=0)

    class Meta:
        indexes = [models.Index(fields=["challenge", "-from_ts"])]

    def __str__(self) -> str:
        return f"KotH {self.challenge_id} owned by {self.owner_team_id}"


def verify_flag(challenge: Challenge, submitted_flag: str) -> bool:
    return hmac.compare_digest(hmac_flag(submitted_flag), challenge.flag_hmac)