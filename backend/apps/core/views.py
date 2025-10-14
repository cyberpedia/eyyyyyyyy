from __future__ import annotations

import hmac
import logging

from django.contrib.auth import authenticate, login, logout, get_user_model
from django.db import transaction
from django.http import Http404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import RetrieveAPIView, CreateAPIView
from rest_framework.throttling import ScopedRateThrottle

from .models import Team, Membership
from .serializers import (
    RegisterSerializer,
    UserPublicSerializer,
    UserUpdateSerializer,
    TeamPublicSerializer,
    TeamCreateSerializer,
)
from .throttles import PerIPRateThrottle

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
    throttle_classes = [ScopedRateThrottle, PerIPRateThrottle]

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