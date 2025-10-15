from __future__ import annotations

from typing import List

from rest_framework import serializers

from apps.core.models import Team
from .models import Category, Tag, Challenge, Submission, hmac_flag


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name"]


class ChallengeListItemSerializer(serializers.ModelSerializer):
    category = serializers.SerializerMethodField()
    category_slug = serializers.SerializerMethodField()
    points_current = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    solved = serializers.SerializerMethodField()

    class Meta:
        model = Challenge
        fields = [
            "id",
            "title",
            "slug",
            "category",
            "category_slug",
            "points_current",
            "points_min",
            "points_max",
            "tags",
            "is_dynamic",
            "released_at",
            "mode",
            "tick_seconds",
        ]

    def get_category(self, obj):
        return obj.category.name if obj.category else None

    def get_category_slug(self, obj):
        return obj.category.slug if obj.category else None

    def get_points_current(self, obj):
        return obj.current_points()

    def get_tags(self, obj):
        return list(obj.tags.values_list("name", flat=True))

    def get_solved(self, obj):
        user = self.context["request"].user
        if not user.is_authenticated:
            return False
        team = Team.objects.filter(memberships__user=user).first()
        if not team:
            return False
        return Submission.objects.filter(team=team, challenge=obj, is_correct=True).exists()


class ChallengeDetailSerializer(ChallengeListItemSerializer):
    description = serializers.CharField()

    class Meta(ChallengeListItemSerializer.Meta):
        fields = ChallengeListItemSerializer.Meta.fields + ["description"]


class ChallengeAdminSerializer(serializers.ModelSerializer):
    flag = serializers.CharField(write_only=True)

    class Meta:
        model = Challenge
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "category",
            "scoring_model",
            "points_min",
            "points_max",
            "k",
            "is_dynamic",
            "released_at",
            "mode",
            "tick_seconds",
            "instance_required",
            "checker_config",
            "flag",
            "flag_hmac",
        ]
        read_only_fields = ["flag_hmac"]

    def create(self, validated_data):
        flag = validated_data.pop("flag")
        validated_data["flag_hmac"] = hmac_flag(flag)
        challenge = super().create(validated_data)
        return challenge

    def update(self, instance, validated_data):
        flag = validated_data.pop("flag", None)
        if flag:
            instance.flag_hmac = hmac_flag(flag)
        return super().update(instance, validated_data)


class SubmissionRequestSerializer(serializers.Serializer):
    flag = serializers.CharField()


class SubmissionResponseSerializer(serializers.Serializer):
    correct = serializers.BooleanField()
    points_awarded = serializers.IntegerField()
    first_blood = serializers.BooleanField()
    challenge_id = serializers.IntegerField()
    team_total = serializers.IntegerField()
    message = serializers.CharField()