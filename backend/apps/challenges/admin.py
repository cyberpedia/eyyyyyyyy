from django.contrib import admin
from .models import Category, Tag, Challenge, Submission, ChallengeSnapshot


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
    list_display = ("id", "title", "slug", "category", "scoring_model", "points_max", "released_at")
    list_filter = ("scoring_model", "category")
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