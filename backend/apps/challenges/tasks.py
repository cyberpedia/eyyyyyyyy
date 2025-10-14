from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Optional

from celery import shared_task
from django.utils import timezone

from apps.core.models import ScoreEvent
from .models import Challenge, TeamServiceInstance, DefenseToken, Challenge as ChallengeModel


def _run_checker(instance: TeamServiceInstance, config: dict) -> bool:
    """
    Placeholder checker that should probe the instance endpoint to verify service health / ownership proof.
    Returns True if healthy. In production, implement per-challenge probes based on checker_config.
    """
    # TODO: Implement actual probing (HTTP/TCP/command) based on config
    return instance.status == TeamServiceInstance.STATUS_RUNNING


def mint_defense_token(team_id: int, challenge: ChallengeModel, instance: Optional[TeamServiceInstance], tick_index: int) -> DefenseToken:
    """
    Create a defense token for a team/challenge at a specific tick. The token expires after tick_seconds.
    """
    token = secrets.token_urlsafe(32)
    now = timezone.now()
    expires = now + timedelta(seconds=challenge.tick_seconds)
    dt = DefenseToken.objects.create(
        team_id=team_id,
        challenge=challenge,
        instance=instance,
        tick=tick_index,
        token=token,
        minted_at=now,
        expires_at=expires,
    )
    return dt


@shared_task
def run_tick(challenge_id: int, tick_index: int):
    """
    Periodic tick for multi-mode challenges.
    - ATTACK_DEFENSE: award defense uptime and mint tokens per team instance.
    - KOTH: award hold points to current owner (ownership detection to be implemented).
    """
    try:
        challenge = Challenge.objects.get(id=challenge_id)
    except Challenge.DoesNotExist:
        return

    if challenge.mode == Challenge.MODE_ATTACK_DEFENSE:
        points_def = int(challenge.checker_config.get("ad_defense_points", 5))
        instances = TeamServiceInstance.objects.filter(challenge_id=challenge_id, status=TeamServiceInstance.STATUS_RUNNING)
        for inst in instances:
            ok = _run_checker(inst, challenge.checker_config or {})
            inst.last_check_at = timezone.now()
            inst.save(update_fields=["last_check_at"])
            if ok:
                ScoreEvent.objects.create(
                    team_id=inst.team_id,
                    user=None,
                    challenge_id=challenge_id,
                    type=ScoreEvent.TYPE_AD_DEFENSE_UPTIME,
                    delta=points_def,
                    metadata={"tick": tick_index},
                )
                mint_defense_token(inst.team_id, challenge, inst, tick_index)

    elif challenge.mode == Challenge.MODE_KOTH:
        # Ownership detection should set the current owner based on checker probes.
        # For now, this is a stub; integrate your checker and update OwnershipEvent accordingly.
        owner_team_id = None  # TODO: compute owner team id via checker
        if owner_team_id:
            points_hold = int(challenge.checker_config.get("koth_points_per_tick", 5))
            ScoreEvent.objects.create(
                team_id=owner_team_id,
                user=None,
                challenge_id=challenge_id,
                type=ScoreEvent.TYPE_KOTH_HOLD,
                delta=points_hold,
                metadata={"tick": tick_index},
            )