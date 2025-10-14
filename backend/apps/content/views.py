from __future__ import annotations

from django.http import Http404
from django.utils import timezone
from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Team, ScoreEvent, Membership
from apps.challenges.models import Challenge
from django.contrib.auth import get_user_model

from .models import ContentPage, WriteUp
from .serializers import ContentPageSerializer, WriteUpSerializer


User = get_user_model()


class ContentPageView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug: str):
        try:
            page = ContentPage.objects.get(slug=slug, published=True)
        except ContentPage.DoesNotExist:
            raise Http404
        return Response(ContentPageSerializer(page).data)


class ChallengeWriteUpsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, id: int):
        status_q = request.query_params.get("status", WriteUp.STATUS_APPROVED)
        try:
            challenge = Challenge.objects.get(id=id)
        except Challenge.DoesNotExist:
            raise Http404
        qs = WriteUp.objects.filter(challenge=challenge)
        if status_q:
            qs = qs.filter(status=status_q)
        qs = qs.order_by("-published_at", "-created_at")
        data = WriteUpSerializer(qs, many=True).data
        return Response({"results": data})

    def post(self, request, id: int):
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            challenge = Challenge.objects.get(id=id)
        except Challenge.DoesNotExist:
            raise Http404
        title = (request.data.get("title") or "").strip()
        content_md = (request.data.get("content_md") or "").strip()
        if not title or not content_md:
            return Response({"detail": "title and content_md required"}, status=status.HTTP_400_BAD_REQUEST)

        # Team from membership (if any)
        team = Team.objects.filter(memberships__user=request.user).first()

        w = WriteUp.objects.create(
            challenge=challenge,
            user=request.user,
            team=team,
            title=title,
            content_md=content_md,
            status=WriteUp.STATUS_PENDING,
        )
        return Response(WriteUpSerializer(w).data, status=status.HTTP_201_CREATED)


class WriteUpModerateView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, id: int):
        try:
            w = WriteUp.objects.get(id=id)
        except WriteUp.DoesNotExist:
            raise Http404
        action = (request.data.get("action") or "").strip().lower()
        notes = (request.data.get("notes") or "").strip()

        if action not in {"approve", "reject"}:
            return Response({"detail": "action must be 'approve' or 'reject'"}, status=status.HTTP_400_BAD_REQUEST)

        if action == "approve":
            w.status = WriteUp.STATUS_APPROVED
            w.published_at = timezone.now()
            w.moderation_notes = notes
            w.save(update_fields=["status", "published_at", "moderation_notes"])

            # Award bonus to team if exists
            if w.team_id:
                ScoreEvent.objects.create(
                    team=w.team,
                    user=w.user,
                    challenge_id=w.challenge_id,
                    type=ScoreEvent.TYPE_WRITEUP_BONUS,
                    delta=getattr(settings, "WRITEUP_BONUS_POINTS", 25),
                    metadata={"writeup_id": w.id},
                )
        else:
            w.status = WriteUp.STATUS_REJECTED
            w.moderation_notes = notes
            w.save(update_fields=["status", "moderation_notes"])

        return Response(WriteUpSerializer(w).data)


class WriteUpsAdminListView(APIView):
    """
    Staff-only listing of write-ups by status (default pending), optional challenge_id filter.
    """
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        status_q = (request.query_params.get("status") or WriteUp.STATUS_PENDING).strip()
        challenge_id = request.query_params.get("challenge_id")
        qs = WriteUp.objects.all()
        if challenge_id:
            qs = qs.filter(challenge_id=challenge_id)
        if status_q:
            qs = qs.filter(status=status_q)
        qs = qs.order_by("-created_at")
        data = WriteUpSerializer(qs, many=True).data
        return Response({"results": data})