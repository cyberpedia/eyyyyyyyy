from django.contrib import admin
from .models import ContentPage, WriteUp


@admin.register(ContentPage)
class ContentPageAdmin(admin.ModelAdmin):
    list_display = ("slug", "title", "version", "published", "updated_at")
    list_filter = ("published",)
    search_fields = ("slug", "title")


@admin.register(WriteUp)
class WriteUpAdmin(admin.ModelAdmin):
    list_display = ("id", "challenge", "title", "user", "team", "status", "published_at", "created_at")
    list_filter = ("status", "challenge")
    search_fields = ("title", "user__username", "team__name")