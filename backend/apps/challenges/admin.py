from django.contrib import admin
from .models import (
    Category,
    Tag,
    Challenge,
    Submission,
    ChallengeSnapshot,
    TeamServiceInstance,
    DefenseToken,
    AttackEvent,
    OwnershipEvent,
    RoundTick,
)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug")
    search_fields = ("name", "slug")


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(Challenge)
class ChallengeAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "slug", "category", "mode", "scoring_model", "points_max", "released_at")
    list_filter = ("scoring_model", "category", "mode")
    search_fields = ("title", "slug")


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ("id", "team", "challenge", "is_correct", "flag_prefix", "created_at")
    list_filter = ("is_correct",)
    search_fields = ("team__name", "challenge__title")


@admin.register(ChallengeSnapshot)
class ChallengeSnapshotAdmin(admin.ModelAdmin):
    list_display = ("id", "challenge", "reason", "created_at")
    list_filter = ("reason", "challenge")
    search_fields = ("challenge__title", "challenge__slug")


@admin.register(TeamServiceInstance)
class TeamServiceInstanceAdmin(admin.ModelAdmin):
    list_display = ("id", "team", "challenge", "status", "endpoint_url", "last_check_at", "created_at")
    list_filter = ("status", "challenge")
    search_fields = ("team__name", "challenge__title")


@admin.register(DefenseToken)
class DefenseTokenAdmin(admin.ModelAdmin):
    list_display = ("id", "challenge", "team", "tick", "minted_at", "expires_at")
    list_filter = ("challenge",)
    search_fields = ("team__name", "challenge__title", "token")


@admin.register(AttackEvent)
class AttackEventAdmin(admin.ModelAdmin):
    list_display = ("id", "challenge", "attacker_team", "victim_team", "tick", "points_awarded", "created_at")
    list_filter = ("challenge",)
    search_fields = ("attacker_team__name", "victim_team__name")


@admin.register(OwnershipEvent)
class OwnershipEventAdmin(admin.ModelAdmin):
    list_display = ("id", "challenge", "owner_team", "from_ts", "to_ts", "points_awarded")
    list_filter = ("challenge",)
    search_fields = ("owner_team__name", "challenge__title")


@admin.register(RoundTick)
class RoundTickAdmin(admin.ModelAdmin):
    list_display = ("id", "challenge", "tick_index", "started_at", "finished_at")
    list_filter = ("challenge",)
    search_fields = ("challenge__title",)