from __future__ import annotations

import hmac
import logging
import json
from pathlib import Path
from typing import Dict, Any

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.core.cache import cache
from django.db import transaction
from django.http import Http404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import RetrieveAPIView, CreateAPIView
from rest_framework.settings import api_settings
from django.http import HttpResponse

from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from .models import UiConfig
from .serializers import UiConfigSerializer

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
    Non-admin ops view: visualize and update throttle defaults, DB overrides, effective rates and cache state.
    Requires staff user (IsAdminUser) but avoids using Django admin.
    """
    permission_classes = [permissions.IsAdminUser]

    def _payload(self):
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

        return {
            "defaults": defaults,
            "db_overrides": db_rows,
            "effective": effective,
            "cache": cache_state,
        }

    def get(self, request):
        return Response(self._payload())

    def post(self, request):
        """
        Upsert a RateLimitConfig row.
        Body: { "scope": "flag-submit", "user_rate": "10/min", "ip_rate": "30/min" }
        Empty strings clear the override; invalid formats return 400.
        """
        scope = (request.data.get("scope") or "").strip()
        user_rate = (request.data.get("user_rate") or "").strip()
        ip_rate = (request.data.get("ip_rate") or "").strip()

        if not scope:
            return Response({"detail": "scope required"}, status=status.HTTP_400_BAD_REQUEST)

        # Validate rate format using DRF's parser
        from rest_framework.throttling import SimpleRateThrottle

        parser = SimpleRateThrottle()
        def _validate(rate: str) -> bool:
            if rate == "":
                return True
            return parser.parse_rate(rate) is not None

        if not _validate(user_rate):
            return Response({"detail": "invalid user_rate format"}, status=status.HTTP_400_BAD_REQUEST)
        if not _validate(ip_rate):
            return Response({"detail": "invalid ip_rate format"}, status=status.HTTP_400_BAD_REQUEST)

        RateLimitConfig.objects.update_or_create(
            scope=scope, defaults={"user_rate": user_rate, "ip_rate": ip_rate}
        )

        # Warm caches for immediate effect
        cache.set(f"ratelimit:{scope}:user", user_rate or "", 60)
        cache.set(f"ratelimit:{scope}:ip", ip_rate or "", 60)

        return Response(self._payload(), status=status.HTTP_200_OK)

    def delete(self, request):
        """
        Delete a RateLimitConfig row by scope.
        Accepts scope via JSON body or query param (?scope=...).
        """
        scope = (request.data.get("scope") or request.query_params.get("scope") or "").strip()
        if not scope:
            return Response({"detail": "scope required"}, status=status.HTTP_400_BAD_REQUEST)
        RateLimitConfig.objects.filter(scope=scope).delete()
        cache.delete(f"ratelimit:{scope}:user")
        cache.delete(f"ratelimit:{scope}:ip")
        return Response(self._payload(), status=status.HTTP_200_OK)


class RateLimitsCacheView(APIView):
    """
    Clear ratelimit caches. Optionally pass a scope to clear only that scope's entries.
    """
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        scope = (request.data.get("scope") or "").strip()
        if scope:
            cache.delete(f"ratelimit:{scope}:user")
            cache.delete(f"ratelimit:{scope}:ip")
        else:
            cache.clear()
        # Return current payload
        view = RateLimitsStatusView()
        return Response(view._payload(), status=status.HTTP_200_OK)


class RateLimitPresetsView(APIView):
    """
    Manage preset configurations stored on disk (config/rate_limit_presets.json).
    Allows ops/admins to adjust presets without code changes.
    """
    permission_classes = [permissions.IsAdminUser]

    def _default(self) -> Dict[str, Any]:
        return {
            "presets": {
                "competition": {
                    "flag-submit": {"user_rate": "10/min", "ip_rate": "30/min"},
                    "login": {"user_rate": "", "ip_rate": "5/min"},
                },
                "practice": {
                    "flag-submit": {"user_rate": "30/min", "ip_rate": "60/min"},
                    "login": {"user_rate": "", "ip_rate": "30/min"},
                },
                "heavy": {
                    "flag-submit": {"user_rate": "20/min", "ip_rate": "100/min"},
                    "login": {"user_rate": "", "ip_rate": "15/min"},
                },
            },
            "env_presets": {
                "dev": {
                    "flag-submit": {"user_rate": "120/min", "ip_rate": "240/min"},
                    "login": {"user_rate": "", "ip_rate": "60/min"},
                },
                "staging": {
                    "flag-submit": {"user_rate": "30/min", "ip_rate": "60/min"},
                    "login": {"user_rate": "", "ip_rate": "15/min"},
                },
                "prod": {
                    "flag-submit": {"user_rate": "10/min", "ip_rate": "30/min"},
                    "login": {"user_rate": "", "ip_rate": "5/min"},
                },
            },
        }

    def _validate_rates(self, cfg: Dict[str, Any]) -> bool:
        from rest_framework.throttling import SimpleRateThrottle

        parser = SimpleRateThrottle()

        def ok(rate: str) -> bool:
            return rate == "" or parser.parse_rate(rate) is not None

        def check_map(m: Dict[str, Any]) -> bool:
            for scope, rates in m.items():
                if not isinstance(rates, dict):
                    return False
                ur = rates.get("user_rate", "")
                ir = rates.get("ip_rate", "")
                if not isinstance(ur, str) or not isinstance(ir, str):
                    return False
                if not ok(ur) or not ok(ir):
                    return False
            return True

        presets = cfg.get("presets", {})
        env_presets = cfg.get("env_presets", {})
        if not isinstance(presets, dict) or not isinstance(env_presets, dict):
            return False

        # Validate each preset group
        for name, m in presets.items():
            if not isinstance(m, dict) or not check_map(m):
                return False
        for name, m in env_presets.items():
            if not isinstance(m, dict) or not check_map(m):
                return False
        return True

    def get(self, request):
        path = Path(settings.RATE_LIMIT_PRESETS_PATH)
        if path.exists():
            try:
                with path.open("r") as f:
                    data = json.load(f)
                return Response(data)
            except Exception:
                # Fall back to defaults if file corrupted
                return Response(self._default())
        return Response(self._default())

    def post(self, request):
        """
        Overwrite presets file. Body should be JSON with keys:
        { "presets": { ... }, "env_presets": { ... } }
        Requires superuser privileges.
        """
        if not request.user.is_superuser:
            return Response({"detail": "superuser required"}, status=status.HTTP_403_FORBIDDEN)

        try:
            cfg = dict(request.data)
        except Exception:
            return Response({"detail": "invalid payload"}, status=status.HTTP_400_BAD_REQUEST)

        if not self._validate_rates(cfg):
            return Response({"detail": "invalid presets structure or rate format"}, status=status.HTTP_400_BAD_REQUEST)

        path = Path(settings.RATE_LIMIT_PRESETS_PATH)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w") as f:
            json.dump(cfg, f, indent=2)

        return Response(cfg, status=status.HTTP_200_OK)


class RateLimitPresetsValidateView(APIView):
    """
    Validate presets payload (structure + rate formats). Staff-only.
    Returns detailed errors for use in Ops UI.
    """
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        errors = []

        try:
            cfg = dict(request.data)
        except Exception:
            return Response({"valid": False, "errors": ["invalid JSON"]}, status=status.HTTP_400_BAD_REQUEST)

        from rest_framework.throttling import SimpleRateThrottle

        parser = SimpleRateThrottle()

        def ok(rate: str) -> bool:
            return rate == "" or parser.parse_rate(rate) is not None

        if "presets" not in cfg or not isinstance(cfg["presets"], dict):
            errors.append("presets must be an object")
        else:
            for name, scopes_map in cfg["presets"].items():
                if not isinstance(scopes_map, dict):
                    errors.append(f"preset '{name}' must be an object mapping scopes")
                    continue
                for scope, rates in scopes_map.items():
                    if not isinstance(rates, dict):
                        errors.append(f"preset '{name}': scope '{scope}' must have object with user_rate/ip_rate")
                        continue
                    ur = rates.get("user_rate", "")
                    ir = rates.get("ip_rate", "")
                    if not isinstance(ur, str) or not isinstance(ir, str):
                        errors.append(f"preset '{name}': scope '{scope}' user_rate/ip_rate must be strings")
                        continue
                    if not ok(ur):
                        errors.append(f"preset '{name}': scope '{scope}' invalid user_rate '{ur}'")
                    if not ok(ir):
                        errors.append(f"preset '{name}': scope '{scope}' invalid ip_rate '{ir}'")

        if "env_presets" not in cfg or not isinstance(cfg["env_presets"], dict):
            errors.append("env_presets must be an object")
        else:
            for env, scopes_map in cfg["env_presets"].items():
                if not isinstance(scopes_map, dict):
                    errors.append(f"env '{env}' must be an object mapping scopes")
                    continue
                for scope, rates in scopes_map.items():
                    if not isinstance(rates, dict):
                        errors.append(f"env '{env}': scope '{scope}' must have object with user_rate/ip_rate")
                        continue
                    ur = rates.get("user_rate", "")
                    ir = rates.get("ip_rate", "")
                    if not isinstance(ur, str) or not isinstance(ir, str):
                        errors.append(f"env '{env}': scope '{scope}' user_rate/ip_rate must be strings")
                        continue
                    if not ok(ur):
                        errors.append(f"env '{env}': scope '{scope}' invalid user_rate '{ur}'")
                    if not ok(ir):
                        errors.append(f"env '{env}': scope '{scope}' invalid ip_rate '{ir}'")

        return Response({"valid": len(errors) == 0, "errors": errors})


# Observability endpoints

class HealthzView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


class ReadinessView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # Basic readiness: DB, cache checks could be added here; minimal ok for now
        return Response({"status": "ready"})


class MetricsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # Expose Prometheus metrics
        data = generate_latest()
        return HttpResponse(data, content_type=CONTENT_TYPE_LATEST)


class UiConfigView(APIView):
    """
    GET: public (AllowAny) - returns current UI config.
    POST: admin-only - updates UI config (challenge_list_layout and optional layout_by_category mapping).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

    def get(self, request):
        obj = UiConfig.objects.first()
        if not obj:
            obj = UiConfig(challenge_list_layout=UiConfig.LAYOUT_LIST)
        return Response(UiConfigSerializer(obj).data)

    def post(self, request):
        from apps.challenges.models import Category

        obj, _ = UiConfig.objects.get_or_create(singleton=True, defaults={"challenge_list_layout": UiConfig.LAYOUT_LIST})
        payload = request.data or {}
        layout = (payload.get("challenge_list_layout") or "").strip()
        valid = dict(UiConfig.LAYOUT_CHOICES).keys()
        if layout and layout not in valid:
            return Response({"detail": f"invalid layout. valid: {', '.join(valid)}"}, status=status.HTTP_400_BAD_REQUEST)

        overrides = payload.get("layout_by_category", {}) or {}
        # Validate override values
        cleaned = {}
        for slug, ov in overrides.items():
            if not isinstance(slug, str):
                continue
            l = (ov or "").strip()
            if not l:
                # blank override -> remove override
                continue
            if l not in valid:
                return Response({"detail": f"invalid layout '{l}' for category '{slug}'"}, status=status.HTTP_400_BAD_REQUEST)
            # Optional: ensure category exists
            if not Category.objects.filter(slug=slug).exists():
                return Response({"detail": f"unknown category slug '{slug}'"}, status=status.HTTP_400_BAD_REQUEST)
            cleaned[slug] = l

        if layout:
            obj.challenge_list_layout = layout
        obj.layout_by_category = cleaned
        obj.save(update_fields=["challenge_list_layout", "layout_by_category", "updated_at"])
        return Response(UiConfigSerializer(obj).data)