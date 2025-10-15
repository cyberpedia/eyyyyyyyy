from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Team, Membership, UiConfig

User = get_user_model()


class UserPublicSerializer(serializers.ModelSerializer):
    teamId = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()
    isStaff = serializers.BooleanField(source="is_staff", read_only=True)
    isSuperuser = serializers.BooleanField(source="is_superuser", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "teamId", "score", "isStaff", "isSuperuser"]
        read_only_fields = ["id", "teamId", "score", "isStaff", "isSuperuser"]

    def get_teamId(self, obj):
        membership = obj.memberships.select_related("team").first()
        return membership.team_id if membership else None

    def get_score(self, obj):
        membership = obj.memberships.select_related("team").first()
        return membership.team.score if membership else 0


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["first_name", "last_name"]


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=12)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username already taken")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already in use")
        return value

    def create(self, validated_data):
        user = User(username=validated_data["username"], email=validated_data["email"])
        user.set_password(validated_data["password"])
        user.save()
        return user


class TeamPublicSerializer(serializers.ModelSerializer):
    captainUserId = serializers.IntegerField(source="captain_id", read_only=True)
    membersCount = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = ["id", "name", "slug", "captainUserId", "membersCount", "score"]

    def get_membersCount(self, obj):
        return obj.memberships.count()

    def get_score(self, obj):
        return obj.score


class TeamCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ["name", "slug", "bio"]
        extra_kwargs = {
            "bio": {"required": False},
        }

    def create(self, validated_data):
        user = self.context["request"].user
        team = Team.objects.create(captain=user, **validated_data)
        Membership.objects.create(user=user, team=team, role=Membership.ROLE_CAPTAIN)
        return team


class UiConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = UiConfig
        fields = ["challenge_list_layout", "layout_by_category", "layout_by_tag"]