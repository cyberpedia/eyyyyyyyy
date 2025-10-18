from __future__ import annotations

from rest_framework import serializers

from .models import ContentPage, WriteUp


class ContentPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentPage
        fields = ["slug", "title", "content_md", "content_json", "version", "published"]


class WriteUpSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    challenge_title = serializers.SerializerMethodField()
    challenge_slug = serializers.SerializerMethodField()

    class Meta:
        model = WriteUp
        fields = [
            "id",
            "challenge",
            "challenge_title",
            "challenge_slug",
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

    def get_challenge_title(self, obj):
        try:
            return obj.challenge.title
        except Exception:
            return ""

    def get_challenge_slug(self, obj):
        try:
            return obj.challenge.slug
        except Exception:
            return ""