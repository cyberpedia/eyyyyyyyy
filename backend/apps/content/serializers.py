from __future__ import annotations

from rest_framework import serializers

from .models import ContentPage


class ContentPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentPage
        fields = ["slug", "title", "content_md", "content_json", "version", "published"]