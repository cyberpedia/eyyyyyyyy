from __future__ import annotations

from rest_framework import serializers

from .models import ContentPage, WriteUp


class ContentPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentPage
        fields = ["slug", "title", "content_md", "content_json", "version", "published"]


class WriteUpSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()

    class Meta:
        model = WriteUp
        fields = [
            "id",
            "challenge",
            "user",
            "username",
            "team",
            "title",
            "content_md",
            "status",
            "moderation_notes",
            "created_at",
            "published_at",
        ]
        read_only_fields = ["user", "team", "status", "moderation_notes", "published_at", "created_at"]

    def get_username(self, obj):
        try:
            return obj.user.username
        except Exception:
            return ""