from __future__ import annotations

import hashlib
import logging
from typing import Optional

from django.db import transaction
from django.db.models import Count, F, Sum
from django.http import Http404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.generics import ListAPIView, RetrieveAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Team, Membership, ScoreEvent
from apps.core.metrics import flag_submissions_total
from .models import (
    Challenge,
    Submission,
    verify_flag,
    Category,
    Tag,
    ChallengeSnapshot,
    DefenseToken,
    AttackEvent,
    TeamServiceInstance,
    OwnershipEvent,
)
from .serializers import (
    ChallengeListItemSerializer,
    ChallengeDetailSerializer,
    SubmissionRequestSerializer,
    SubmissionResponseSerializer,
    ChallengeAdminSerializer,
    CategorySerializer,
)

logger = logging.getLogger(__name__)


class ChallengeListView(ListAPIView):
    serializer_class = ChallengeListItemSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        qs = Challenge.objects.all().order_by("id")
        category = self.request.query_params.get("category")
        tag = self.request.query_params.get("tag")
        released = self.request.query_params.get("released")
        if category:
            qs = qs.filter(category__slug=category)
        if tag:
            qs = qs.filter(tags__name=tag)
        if released == "1":
            qs = qs.filter(released_at__lte=timezone.now())
        return qs.distinct()


class ChallengeDetailView(RetrieveAPIView):
    queryset = Challenge.objects.all()
    serializer_class = ChallengeDetailSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "id"


class FlagSubmitView(APIView):
    throttle_scope = "flag-submit"

    def post(self, request, id: int):
        try:
            challenge = Challenge.objects.get(id=id)
        except Challenge.DoesNotExist:
            raise Http404

        serializer = SubmissionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        flag = serializer.validated_data["flag"]

        team = Team.objects.filter(memberships__user=request.user).first()
        if not team:
            return Response({"detail": "Join or create a team first."}, status=status.HTTP_400_BAD_REQUEST)

        user_agent = request.META.get("HTTP_USER_AGENT", "")[:400]
        ip = request.META.get("REMOTE_ADDR")

        with transaction.atomic():
            # Lock challenge row to avoid races for first blood and dynamic scoring
            Challenge.objects.select_for_update().filter(id=challenge.id).first()

            already_solved = Submission.objects.filter(team=team, challenge=challenge, is_correct=True).exists()
            if already_solved:
                return Response(
                    {
                        "correct": True,
                        "points_awarded": 0,
                        "first_blood": False,
                        "challenge_id": challenge.id,
                        "team_total": team.score,
                        "message": "Already solved.",
                    }
                )

            is_correct = verify_flag(challenge, flag)
            flag_prefix = (flag or "")[:6]

            if not is_correct:
                Submission.objects.create(
                    user=request.user,
                    team=team,
                    challenge=challenge,
                    is_correct=False,
                    flag_prefix=flag_prefix,
                    ip=ip,
                    user_agent=user_agent,
                )
                # Metrics
                try:
                    flag_submissions_total.labels(correct="false").inc()
                except Exception:
                    pass
                return Response(
                    {
                        "correct": False,
                        "points_awarded": 0,
                        "first_blood": False,
                        "challenge_id": challenge.id,
                        "team_total": team.score,
                        "message": "Incorrect flag.",
                    }
                )

            # Correct solve path
            # Count solves before recording this one for dynamic scoring
            solves_before = Submission.objects.filter(challenge=challenge, is_correct=True).count()
            points_awarded = challenge.current_points(solves_before)

            # First blood check
            first_blood_exists = Submission.objects.filter(challenge=challenge, is_correct=True).exists()
            first_blood = not first_blood_exists
            fb_bonus = round(challenge.points_max * 0.10) if first_blood else 0

            Submission.objects.create(
                user=request.user,
                team=team,
                challenge=challenge,
                is_correct=True,
                flag_prefix=flag_prefix,
                ip=ip,
                user_agent=user_agent,
            )

            # Emit score events
            ScoreEvent.objects.create(
                team=team,
                user=request.user,
                challenge_id=challenge.id,
                type=ScoreEvent.TYPE_SOLVE,
                delta=points_awarded,
                metadata={"first_solve_index": solves_before + 1},
            )

            if first_blood and fb_bonus:
                ScoreEvent.objects.create(
                    team=team,
                    user=request.user,
                    challenge_id=challenge.id,
                    type=ScoreEvent.TYPE_FIRST_BLOOD,
                    delta=fb_bonus,
                )

            team_total = team.score  # dynamic property aggregates ScoreEvents

        # Metrics
        try:
            flag_submissions_total.labels(correct="true").inc()
        except Exception:
            pass

        return Response(
            {
                "correct": True,
                "points_awarded": points_awarded + fb_bonus,
                "first_blood": first_blood,
                "challenge_id": challenge.id,
                "team_total": team_total,
                "message": "Correct!",
            }
        )


class AdminChallengeListCreateView(ListCreateAPIView):
    queryset = Challenge.objects.all().order_by("-created_at")
    serializer_class = ChallengeAdminSerializer
    permission_classes = [permissions.IsAdminUser]


class AdminChallengeDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Challenge.objects.all()
    serializer_class = ChallengeAdminSerializer
    permission_classes = [permissions.IsAdminUser]
    lookup_field = "id"


class AdminChallengeSnapshotView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, id: int):
        try:
            c = Challenge.objects.get(id=id)
        except Challenge.DoesNotExist:
            raise Http404
        reason = (request.data.get("reason") or ChallengeSnapshot.REASON_MANUAL).strip()
        snap = ChallengeSnapshot.objects.create(
            challenge=c,
            title=c.title,
            slug=c.slug,
            description=c.description,
            scoring_model=c.scoring_model,
            points_min=c.points_min,
            points_max=c.points_max,
            k=c.k,
            is_dynamic=c.is_dynamic,
            released_at=c.released_at,
            reason=reason if reason in dict(ChallengeSnapshot.REASON_CHOICES) else ChallengeSnapshot.REASON_MANUAL,
        )
        return Response({"id": snap.id, "created_at": snap.created_at}, status=status.HTTP_201_CREATED)


class LeaderboardView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        qs = (
            Team.objects.annotate(score=Sum("score_events__delta"))
            .order_by("-score", "name")
            .values("id", "name", "score")
        )
        results = []
        rank = 0
        last_score = None
        for row in qs:
            score = row["score"] or 0
            if score != last_score:
                rank += 1
                last_score = score
            results.append({"rank": rank, "team_id": row["id"], "team_name": row["name"], "score": score})
        return Response({"as_of": timezone.now(), "results": results})


class CategoriesListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        rows = Category.objects.all().order_by("name")
        data = CategorySerializer(rows, many=True).data
        return Response({"results": data})


# --- Attack-Defense endpoints ---

class ADSubmitView(APIView):
    """
    Submit a captured defense token for Attack-Defense challenges.
    """
    throttle_scope = "flag-submit"

    def post(self, request, id: int):
        try:
            challenge = Challenge.objects.get(id=id)
        except Challenge.DoesNotExist:
            raise Http404
        if challenge.mode != Challenge.MODE_ATTACK_DEFENSE:
            return Response({"detail": "Not an Attack-Defense challenge."}, status=status.HTTP_400_BAD_REQUEST)

        team = Team.objects.filter(memberships__user=request.user).first()
        if not team:
            return Response({"detail": "Join or create a team first."}, status=status.HTTP_400_BAD_REQUEST)

        token = (request.data.get("token") or "").strip()
        if not token:
            return Response({"detail": "token is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Locate defense token
        dt = DefenseToken.objects.filter(challenge=challenge, token=token).first()
        if not dt:
            return Response({"detail": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST)

        if dt.team_id == team.id:
            return Response({"detail": "Cannot submit your own team's token."}, status=status.HTTP_400_BAD_REQUEST)

        if dt.expires_at and dt.expires_at < timezone.now():
            return Response({"detail": "Token expired."}, status=status.HTTP_400_BAD_REQUEST)

        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        # Prevent replay: one AttackEvent per token_hash & challenge
        if AttackEvent.objects.filter(challenge=challenge, token_hash=token_hash).exists():
            return Response({"detail": "Token already used."}, status=status.HTTP_400_BAD_REQUEST)

        points = int(challenge.checker_config.get("ad_attack_points", 100))
        AttackEvent.objects.create(
            attacker_team=team,
            victim_team_id=dt.team_id,
            challenge=challenge,
            tick=dt.tick,
            token_hash=token_hash,
            points_awarded=points,
        )
        ScoreEvent.objects.create(
            team=team,
            user=request.user,
            challenge_id=challenge.id,
            type=ScoreEvent.TYPE_AD_ATTACK_SUCCESS,
            delta=points,
            metadata={"victim_team_id": dt.team_id, "tick": dt.tick},
        )
        # Metrics
        from apps.core.metrics import ad_attack_success_total
        try:
            ad_attack_success_total.inc()
        except Exception:
            pass
        return Response({"ok": True, "points_awarded": points})


class ADAttackLogView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, id: int):
        try:
            challenge = Challenge.objects.get(id=id)
        except Challenge.DoesNotExist:
            raise Http404
        if challenge.mode != Challenge.MODE_ATTACK_DEFENSE:
            return Response({"detail": "Not an Attack-Defense challenge."}, status=status.HTTP_400_BAD_REQUEST)
        logs = (
            AttackEvent.objects.filter(challenge=challenge)
            .order_by("-created_at")[:100]
        )
        results = [
            {
                "id": ev.id,
                "attacker_team_id": ev.attacker_team_id,
                "victim_team_id": ev.victim_team_id,
                "tick": ev.tick,
                "points_awarded": ev.points_awarded,
                "created_at": ev.created_at,
            }
            for ev in logs
        ]
        return Response({"results": results})


class ADServicesStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, id: int):
        try:
            challenge = Challenge.objects.get(id=id)
        except Challenge.DoesNotExist:
            raise Http404
        if challenge.mode != Challenge.MODE_ATTACK_DEFENSE:
            return Response({"detail": "Not an Attack-Defense challenge."}, status=status.HTTP_400_BAD_REQUEST)

        rows = TeamServiceInstance.objects.filter(challenge=challenge).order_by("team__name")
        results = [
            {
                "team_id": inst.team_id,
                "team_name": inst.team.name,
                "status": inst.status,
                "endpoint_url": inst.endpoint_url,
                "last_check_at": inst.last_check_at,
            }
            for inst in rows
        ]
        return Response({"results": results})


# --- KotH endpoints ---

class KothStatusView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, id: int):
        try:
            challenge = Challenge.objects.get(id=id)
        except Challenge.DoesNotExist:
            raise Http404
        if challenge.mode != Challenge.MODE_KOTH:
            return Response({"detail": "Not a KotH challenge."}, status=status.HTTP_400_BAD_REQUEST)

        # Current owner: latest event with open interval or latest by from_ts
        ev = (
            OwnershipEvent.objects.filter(challenge=challenge, to_ts__isnull=True)
            .order_by("-from_ts")
            .first()
        ) or (
            OwnershipEvent.objects.filter(challenge=challenge)
            .order_by("-from_ts")
            .first()
        )
        if not ev:
            return Response({"owner_team_id": None, "owner_team_name": None})
        return Response({"owner_team_id": ev.owner_team_id, "owner_team_name": ev.owner_team.name, "from_ts": ev.from_ts})


class KothOwnershipHistoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, id: int):
        try:
            challenge = Challenge.objects.get(id=id)
        except Challenge.DoesNotExist:
            raise Http404
        if challenge.mode != Challenge.MODE_KOTH:
            return Response({"detail": "Not a KotH challenge."}, status=status.HTTP_400_BAD_REQUEST)

        rows = OwnershipEvent.objects.filter(challenge=challenge).order_by("-from_ts")[:100]
        results = [
            {
                "owner_team_id": r.owner_team_id,
                "owner_team_name": r.owner_team.name,
                "from_ts": r.from_ts,
                "to_ts": r.to_ts,
                "points_awarded": r.points_awarded,
            }
            for r in rows
        ]
        return Response({"results": results})


# --- Instances API (spawn/stop/list) ---

class InstancesSpawnView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        challenge_id = request.data.get("challenge_id")
        if not challenge_id:
            return Response({"detail": "challenge_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            challenge = Challenge.objects.get(id=int(challenge_id))
        except (Challenge.DoesNotExist, ValueError):
            raise Http404

        if not challenge.instance_required:
            return Response({"detail": "This challenge does not support instances."}, status=status.HTTP_400_BAD_REQUEST)

        team = Team.objects.filter(memberships__user=request.user).first()
        if not team:
            return Response({ "detail": "Join or create a team first." }, status=status.HTTP_400_BAD_REQUEST)

        inst = TeamServiceInstance.objects.create(
            team=team,
            challenge=challenge,
            status=TeamServiceInstance.STATUS_PENDING,
            endpoint_url="",
        )
        return Response({
            "id": inst.id,
            "team_id": inst.team_id,
            "challenge_id": inst.challenge_id,
            "status": inst.status,
            "endpoint_url": inst.endpoint_url,
        }, status=status.HTTP_201_CREATED)


class InstancesStopView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        instance_id = request.data.get("instance_id")
        if not instance_id:
            return Response({"detail": "instance_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            inst = TeamServiceInstance.objects.get(id=int(instance_id))
        except (TeamServiceInstance.DoesNotExist, ValueError):
            raise Http404

        # Only the owning team's member can stop
        team = Team.objects.filter(memberships__user=request.user).first()
        if not team or inst.team_id != team.id:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        inst.status = TeamServiceInstance.STATUS_STOPPED
        inst.save(update_fields=["status"])
        return Response({"ok": True})


class InstancesMyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        team = Team.objects.filter(memberships__user=request.user).first()
        if not team:
            return Response({"results": []})
        rows = TeamServiceInstance.objects.filter(team=team).order_by("-created_at")
        results = [
            {
                "id": r.id,
                "challenge_id": r.challenge_id,
                "status": r.status,
                "endpoint_url": r.endpoint_url,
                "last_check_at": r.last_check_at,
            }
            for r in rows
        ]
        return Response({"results": results})