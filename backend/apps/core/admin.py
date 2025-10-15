from django.contrib import admin
from .models import Team, Membership, ScoreEvent, AuditLog, RateLimitConfig, UiConfig


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


@admin.register(RateLimitConfig)
class RateLimitConfigAdmin(admin.ModelAdmin):
    list_display = ("scope", "user_rate", "ip_rate", "updated_at")
    search_fields = ("scope",)


@admin.register(UiConfig)
class UiConfigAdmin(admin.ModelAdmin):
    list_display = ("challenge_list_layout", "updated_at")
    readonly_fields = ()
    fieldsets = (
        (None, {"fields": ("challenge_list_layout",)}),
    )

    def has_add_permission(self, request):
        # Enforce singleton
        count = UiConfig.objects.count()
        if count >= 1:
            return False
        return super().has_add_permission(request)