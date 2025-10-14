from __future__ import annotations

import hmac
import logging
from typing import Dict, Any

from django.contrib.auth import authenticate, login, logout, get_user_model
from django.core.cache import cache
from django.db import transaction
from django.http import Http404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import RetrieveAPIView, CreateAPIView
from rest_framework.settings import api_settings

from .models import Team, Membership, RateLimitConfig
from .serializers import (
    RegisterSerializer,
    UserPublicSerializer,
    UserUpdateSerializer,
    TeamPublicSerializer,
    TeamCreateSerializer,
)


logger = logging.getLogger(__name__)
User = get_user_model()


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        data = UserPublicSerializer(user).data
        return Response(data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "login"

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        if not username or not password:
            return Response({"detail": "username and password required"}, status=status.HTTP_400_BAD_REQUEST)
        user = authenticate(request, username=username, password=password)
        if not user:
            return Response({"detail": "invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)
        login(request, user)
        return Response({"detail": "ok"})


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(UserPublicSerializer(request.user).data)

    def put(self, request):
        serializer = UserUpdateSerializer(instance=request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserPublicSerializer(request.user).data)


class UserDetailView(RetrieveAPIView):
    queryset = User.objects.all()
    serializer_class = UserPublicSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "id"


class NotificationsView(APIView):
    def get(self, request):
        # Placeholder empty list; will be implemented with DB model later
        return Response({"results": []})


class TeamCreateView(CreateAPIView):
    serializer_class = TeamCreateSerializer

    def get_queryset(self):
        return Team.objects.all()

    def perform_create(self, serializer):
        serializer.save()


class TeamDetailView(RetrieveAPIView):
    queryset = Team.objects.all()
    serializer_class = TeamPublicSerializer
    lookup_field = "id"


class TeamInviteView(APIView):
    def post(self, request, id: int):
        try:
            team = Team.objects.get(id=id)
        except Team.DoesNotExist:
            raise Http404
        if not Membership.objects.filter(user=request.user, team=team, role=Membership.ROLE_CAPTAIN).exists():
            return Response({"detail": "Only captain can invite"}, status=status.HTTP_403_FORBIDDEN)
        username = request.data.get("username")
        if not username:
            return Response({"detail": "username required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"detail": "user not found"}, status=status.HTTP_404_NOT_FOUND)
        Membership.objects.get_or_create(user=user, team=team, defaults={"role": Membership.ROLE_MEMBER})
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamJoinView(APIView):
    def post(self, request, id: int):
        try:
            team = Team.objects.get(id=id)
        except Team.DoesNotExist:
            raise Http404
        Membership.objects.get_or_create(user=request.user, team=team, defaults={"role": Membership.ROLE_MEMBER})
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamTransferView(APIView):
    def post(self, request, id: int):
        try:
            team = Team.objects.get(id=id)
        except Team.DoesNotExist:
            raise Http404
        if not Membership.objects.filter(user=request.user, team=team, role=Membership.ROLE_CAPTAIN).exists():
            return Response({"detail": "Only captain can transfer"}, status=status.HTTP_403_FORBIDDEN)
        new_captain_id = request.data.get("newCaptainUserId")
        if not new_captain_id:
            return Response({"detail": "newCaptainUserId required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_captain = User.objects.get(id=new_captain_id)
        except User.DoesNotExist:
            return Response({"detail": "user not found"}, status=status.HTTP_404_NOT_FOUND)
        if not Membership.objects.filter(user=new_captain, team=team).exists():
            return Response({"detail": "user is not a team member"}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            Membership.objects.filter(user=team.captain, team=team, role=Membership.ROLE_CAPTAIN).update(
                role=Membership.ROLE_MEMBER
            )
            Membership.objects.filter(user=new_captain, team=team).update(role=Membership.ROLE_CAPTAIN)
            team.captain = new_captain
            team.save(update_fields=["captain"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class RateLimitsStatusView(APIView):
    """
    Non-admin ops view: visualize throttle defaults, DB overrides, effective rates and cache state.
    Requires staff user (IsAdminUser) but avoids using Django admin.
    """
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        defaults: Dict[str, str] = dict(api_settings.DEFAULT_THROTTLE_RATES or {})
        db_rows = list(
            RateLimitConfig.objects.all().order_by("scope").values("scope", "user_rate", "ip_rate", "updated_at")
        )
        scopes = set()
        for key in defaults.keys():
            if key.endswith("-ip"):
                scopes.add(key[:-3])
            else:
                scopes.add(key)
        for row in db_rows:
            scopes.add(row["scope"])

        effective = {}
        cache_state = {}
        for scope in sorted(scopes):
            db_row = next((r for r in db_rows if r["scope"] == scope), None)
            user_rate = (db_row and db_row.get("user_rate")) or defaults.get(scope)
            ip_rate = (db_row and db_row.get("ip_rate")) or defaults.get(f"{scope}-ip")
            effective[scope] = {"user_rate": user_rate, "ip_rate": ip_rate}

            # Cache values (present or not)
            cached_user = cache.get(f"ratelimit:{scope}:user")
            cached_ip = cache.get(f"ratelimit:{scope}:ip")
            cache_state[scope] = {
                "user_cached": cached_user is not None,
                "user_value": cached_user if cached_user is not None else None,
                "ip_cached": cached_ip is not None,
                "ip_value": cached_ip if cached_ip is not None else None,
            }

        return Response(
            {
                "defaults": defaults,
                "db_overrides": db_rows,
                "effective": effective,
                "cache": cache_state,
            }
        )