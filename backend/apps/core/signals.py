from __future__ import annotations

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from django.db.models import Sum

from .models import ScoreEvent, Team


def _compute_leaderboard_payload():
    qs = Team.objects.annotate(score=Sum("score_events__delta")).order_by("-score", "name").values("id", "name", "score")
    results = []
    rank = 0
    last_score = None
    for row in qs:
        score = row["score"] or 0
        if score != last_score:
            rank += 1
            last_score = score
        results.append({"rank": rank, "team_id": row["id"], "team_name": row["name"], "score": score})
    return {"as_of": timezone.now().isoformat(), "results": results}


@receiver(post_save, sender=ScoreEvent)
def broadcast_leaderboard_on_scoreevent(sender, instance: ScoreEvent, created: bool, **kwargs):
    # Broadcast on any score change
    try:
        payload = _compute_leaderboard_payload()
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "leaderboard", {"type": "leaderboard.update", "payload": payload}
        )
    except Exception:
        # Avoid breaking request flow due to broadcasting issues
        pass