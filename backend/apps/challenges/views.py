from __future__ import annotations

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
from .models import Challenge, Submission, verify_flag, Category, Tag, ChallengeSnapshot
from .serializers import (
    ChallengeListItemSerializer,
    ChallengeDetailSerializer,
    SubmissionRequestSerializer,
    SubmissionResponseSerializer,
    ChallengeAdminSerializer,
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
            if first_blood:
                fb_bonus = round(challenge.points_max * 0.10)
            else:
                fb_bonus = 0

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