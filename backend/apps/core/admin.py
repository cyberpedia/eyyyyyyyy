from django.contrib import admin
from .models import Team, Membership, ScoreEvent, AuditLog


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug", "captain", "created_at")
    search_fields = ("name", "slug")


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "team", "role", "joined_at")
    list_filter = ("role",)


@admin.register(ScoreEvent)
class ScoreEventAdmin(admin.ModelAdmin):
    list_display = ("id", "team", "user", "challenge_id", "type", "delta", "created_at")
    list_filter = ("type",)
    search_fields = ("team__name",)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "actor_user", "action", "target_type", "target_id")
    search_fields = ("action", "target_type", "target_id")