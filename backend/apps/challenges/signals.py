from __future__ import annotations

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import AttackEvent, OwnershipEvent, TeamServiceInstance


def _broadcast_ad_status(challenge_id: int):
    # Collect current service status
    rows = TeamServiceInstance.objects.filter(challenge_id=challenge_id).select_related("team").order_by("team__name")
    payload = [
        {
            "team_id": r.team_id,
            "team_name": r.team.name,
            "status": r.status,
            "endpoint_url": r.endpoint_url,
            "last_check_at": r.last_check_at.isoformat() if r.last_check_at else None,
        }
        for r in rows
    ]
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"ad.status.{challenge_id}",
        {"type": "status.update", "payload": payload},
    )


@receiver(post_save, sender=AttackEvent)
def broadcast_attack_event(sender, instance: AttackEvent, created: bool, **kwargs):
    if not created:
        return
    payload = {
        "id": instance.id,
        "attacker_team_id": instance.attacker_team_id,
        "victim_team_id": instance.victim_team_id,
        "tick": instance.tick,
        "points_awarded": instance.points_awarded,
        "created_at": instance.created_at.isoformat(),
    }
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"ad.status.{instance.challenge_id}",
            {"type": "attack.event", "payload": payload},
        )
        _broadcast_ad_status(instance.challenge_id)
    except Exception:
        pass


@receiver(post_save, sender=OwnershipEvent)
def broadcast_koth_update(sender, instance: OwnershipEvent, created: bool, **kwargs):
    payload = {
        "challenge_id": instance.challenge_id,
        "owner_team_id": instance.owner_team_id,
        "from_ts": instance.from_ts.isoformat(),
        "to_ts": instance.to_ts.isoformat() if instance.to_ts else None,
    }
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"koth.status.{instance.challenge_id}",
            {"type": "koth.update", "payload": payload},
        )
    except Exception:
        pass


@receiver(post_save, sender=TeamServiceInstance)
def broadcast_ad_status_on_instance_change(sender, instance: TeamServiceInstance, created: bool, **kwargs):
    try:
        _broadcast_ad_status(instance.challenge_id)
    except Exception:
        pass