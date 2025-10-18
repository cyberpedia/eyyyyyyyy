from __future__ import annotations

import hashlib
from django.http import Http404
from django.utils import timezone
from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Team, ScoreEvent, Membership, AuditLog
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

        prev_status = w.status

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

        # Audit log (chain)
        prev = (
            AuditLog.objects.filter(target_type="writeup", target_id=str(w.id)).order_by("-timestamp").first()
        )
        prev_hash = prev.hash if prev else ""
        actor_id = getattr(request.user, "id", None)
        payload = f"{prev_hash}|{actor_id}|{action}|writeup|{w.id}|{notes}|{prev_status}->{w.status}|{w.moderation_notes}|{timezone.now().isoformat()}"
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        AuditLog.objects.create(
            actor_user=request.user,
            action="writeup_moderate",
            target_type="writeup",
            target_id=str(w.id),
            timestamp=timezone.now(),
            ip=request.META.get("REMOTE_ADDR"),
            data={"action": action, "notes": notes, "prev_status": prev_status, "new_status": w.status},
            prev_hash=prev_hash,
            hash=digest,
        )

        return Response(WriteUpSerializer(w).data)


class WriteUpsAdminListView(APIView):
    """
    Staff-only listing of write-ups by status (default pending), optional challenge_id filter, with pagination.
    """
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        status_q = (request.query_params.get("status") or WriteUp.STATUS_PENDING).strip()
        challenge_id = request.query_params.get("challenge_id")
        try:
            page = int(request.query_params.get("page", "1"))
        except ValueError:
            page = 1
        try:
            page_size = int(request.query_params.get("page_size", "20"))
        except ValueError:
            page_size = 20
        qs = WriteUp.objects.all()
        if challenge_id:
            qs = qs.filter(challenge_id=challenge_id)
        if status_q:
            qs = qs.filter(status=status_q)
        qs = qs.order_by("-created_at")
        total = qs.count()
        start = max(0, (page - 1) * page_size)
        end = start + page_size
        data = WriteUpSerializer(qs[start:end], many=True).data
        return Response(
            {
                "results": data,
                "count": total,
                "page": page,
                "page_size": page_size,
                "has_next": end < total,
                "has_prev": start > 0,
            }
        )


class WriteUpAuditLogView(APIView):
    """
    Staff-only audit trail for a write-up.
    """
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, id: int):
        logs = AuditLog.objects.filter(target_type="writeup", target_id=str(id)).order_by("-timestamp")
        results = []
        for l in logs:
            results.append(
                {
                    "timestamp": l.timestamp,
                    "actor_username": getattr(l.actor_user, "username", "") if l.actor_user_id else "",
                    "action": l.action,
                    "notes": (l.data or {}).get("notes", ""),
                    "prev_status": (l.data or {}).get("prev_status", ""),
                    "new_status": (l.data or {}).get("new_status", ""),
                    "hash": l.hash,
                    "prev_hash": l.prev_hash,
                }
            )
        return Response({"results": results})


class WriteUpAuditLogCsvView(APIView):
    """
    Staff-only CSV export of audit trail for a write-up.
    """
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, id: int):
        import csv
        from io import StringIO
        logs = AuditLog.objects.filter(target_type="writeup", target_id=str(id)).order_by("-timestamp")
        buf = StringIO()
        writer = csv.writer(buf)
        writer.writerow(["timestamp", "actor_username", "action", "notes", "prev_status", "new_status", "hash", "prev_hash"])
        for l in logs:
            writer.writerow([
                l.timestamp.isoformat(),
                getattr(l.actor_user, "username", "") if l.actor_user_id else "",
                l.action,
                (l.data or {}).get("notes", ""),
                (l.data or {}).get("prev_status", ""),
                (l.data or {}).get("new_status", ""),
                l.hash,
                l.prev_hash,
            ])
        from django.http import HttpResponse
        resp = HttpResponse(buf.getvalue(), content_type="text/csv")
        resp["Content-Disposition"] = f'attachment; filename="writeup-{id}-audit.csv"'
        return resp