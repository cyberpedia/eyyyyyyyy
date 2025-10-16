from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class Team(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    captain = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="captain_teams"
    )
    bio = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self) -> str:
        return self.name

    @property
    def score(self) -> int:
        total = self.score_events.aggregate(total=models.Sum("delta")).get("total")
        return total or 0


class Membership(models.Model):
    ROLE_MEMBER = "member"
    ROLE_CAPTAIN = "captain"
    ROLE_CHOICES = [(ROLE_MEMBER, "Member"), (ROLE_CAPTAIN, "Captain")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default=ROLE_MEMBER)
    joined_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = (("user", "team"),)

    def __str__(self) -> str:
        return f"{self.user_id} in {self.team_id} ({self.role})"


class ScoreEvent(models.Model):
    TYPE_SOLVE = "solve"
    TYPE_FIRST_BLOOD = "first_blood"
    TYPE_BONUS = "bonus"
    TYPE_WRITEUP_BONUS = "writeup_bonus"
    TYPE_BADGE = "badge"
    # Extended modes
    TYPE_AD_DEFENSE_UPTIME = "ad_defense_uptime"
    TYPE_AD_ATTACK_SUCCESS = "ad_attack_success"
    TYPE_KOTH_HOLD = "koth_hold"

    TYPE_CHOICES = [
        (TYPE_SOLVE, "Solve"),
        (TYPE_FIRST_BLOOD, "First Blood"),
        (TYPE_BONUS, "Bonus"),
        (TYPE_WRITEUP_BONUS, "Write-up Bonus"),
        (TYPE_BADGE, "Badge"),
        (TYPE_AD_DEFENSE_UPTIME, "Attack-Defense Defense Uptime"),
        (TYPE_AD_ATTACK_SUCCESS, "Attack-Defense Attack Success"),
        (TYPE_KOTH_HOLD, "King of the Hill Hold"),
    ]

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="score_events")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    challenge_id = models.IntegerField(null=True, blank=True)
    type = models.CharField(max_length=32, choices=TYPE_CHOICES)
    delta = models.IntegerField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["team", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.type} {self.delta} for team {self.team_id}"


class AuditLog(models.Model):
    actor_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    actor_team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=200)
    target_type = models.CharField(max_length=120)
    target_id = models.CharField(max_length=120)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    data = models.JSONField(default=dict, blank=True)
    prev_hash = models.CharField(max_length=128, blank=True, default="")
    hash = models.CharField(max_length=128)

    class Meta:
        indexes = [models.Index(fields=["target_type", "target_id"])]

    def __str__(self) -> str:
        return f"{self.timestamp} {self.action} {self.target_type}:{self.target_id}"


class RateLimitConfig(models.Model):
    """
    Optional DB-backed throttling configuration.
    If a row exists for a given scope, the throttle rates override REST_FRAMEWORK.DEFAULT_THROTTLE_RATES.
    - scope: the DRF throttle scope value (e.g., 'flag-submit', 'login')
    - user_rate: e.g., '10/min' (empty string disables the user-scope throttle override)
    - ip_rate: e.g., '30/min' (empty string disables the ip-scope throttle override)
    """

    scope = models.CharField(max_length=64, unique=True)
    user_rate = models.CharField(max_length=32, blank=True, default="")
    ip_rate = models.CharField(max_length=32, blank=True, default="")
    updated_at = models.DateTimeField(default=timezone.now)

    def __str__(self) -> str:
        return f"{self.scope}: user={self.user_rate or '-'} ip={self.ip_rate or '-'}"


class UiConfig(models.Model):
    """
    Global UI configuration controlled via Django admin:
    - challenge_list_layout: how the Challenges page renders
      (list|grid|tabs|cards|masonry|grouped_tags|collapsible).
    - layout_by_category: optional overrides per category slug -> layout.
    - layout_by_tag: optional overrides per tag name -> layout (applies to grouped_tags view).
    - layout_by_event: optional overrides per event slug -> layout.
    Use a singleton row (singleton flag ensures one row).
    """

    LAYOUT_LIST = "list"
    LAYOUT_GRID = "grid"
    LAYOUT_TABS = "tabs"
    LAYOUT_CARDS = "cards"
    LAYOUT_MASONRY = "masonry"
    LAYOUT_GROUPED_TAGS = "grouped_tags"
    LAYOUT_COLLAPSIBLE = "collapsible"
    LAYOUT_CHOICES = [
        (LAYOUT_LIST, "List"),
        (LAYOUT_GRID, "Grid"),
        (LAYOUT_TABS, "Tabs (by category)"),
        (LAYOUT_CARDS, "Cards"),
        (LAYOUT_MASONRY, "Masonry"),
        (LAYOUT_GROUPED_TAGS, "Grouped by Tags"),
        (LAYOUT_COLLAPSIBLE, "Collapsible Categories"),
    ]

    singleton = models.BooleanField(default=True, unique=True)
    challenge_list_layout = models.CharField(max_length=32, choices=LAYOUT_CHOICES, default=LAYOUT_LIST)
    layout_by_category = models.JSONField(default=dict, blank=True)
    layout_by_tag = models.JSONField(default=dict, blank=True)
    layout_by_event = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(default=timezone.now)

    def __str__(self) -> str:
        return f"UI Config (challenge_list_layout={self.challenge_list_layout})"