from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Optional, Tuple, List

import requests
from celery import shared_task
from django.db import transaction
from django.utils import timezone
from .checkers import get_checker

from apps.core.models import ScoreEvent
from .models import (
    Challenge,
    TeamServiceInstance,
    DefenseToken,
    Challenge as ChallengeModel,
    OwnershipEvent,
)


def _http_probe(url: str, timeout: float = 3.0) -> Tuple[bool, Optional[str]]:
    try:
        r = requests.get(url, timeout=timeout)
        if r.status_code == 200:
            return True, r.text
        return False, None
    except Exception:
        return False, None


def _run_checker(instance: TeamServiceInstance, config: dict) -> bool:
    """
    Delegate to pluggable checker (default HttpChecker).
    """
    checker = get_checker(config or {})
    return checker.health_ok(instance, config or {})


def _compute_koth_owner(instances: List[TeamServiceInstance], config: dict) -> Optional[int]:
    """
    Delegate KotH ownership detection to pluggable checker (default HttpChecker).
    """
    checker = get_checker(config or {})
    return checker.koth_owner(instances, config or {})


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
    - KOTH: detect current owner; award hold points and handle ownership transitions.
    """
    try:
        challenge = Challenge.objects.get(id=challenge_id)
    except Challenge.DoesNotExist:
        return

    if challenge.mode == Challenge.MODE_ATTACK_DEFENSE:
        points_def = int((challenge.checker_config or {}).get("ad_defense_points", 5))
        instances = TeamServiceInstance.objects.filter(challenge_id=challenge_id, status=TeamServiceInstance.STATUS_RUNNING)
        any_update = False
        for inst in instances:
            ok = _run_checker(inst, challenge.checker_config or {})
            inst.last_check_at = timezone.now()
            inst.save(update_fields=["last_check_at"])
            any_update = True
            if ok:
                from apps.core.metrics import ad_defense_uptime_ticks_total
                try:
                    ad_defense_uptime_ticks_total.inc()
                except Exception:
                    pass
                ScoreEvent.objects.create(
                    team_id=inst.team_id,
                    user=None,
                    challenge_id=challenge_id,
                    type=ScoreEvent.TYPE_AD_DEFENSE_UPTIME,
                    delta=points_def,
                    metadata={"tick": tick_index},
                )
                mint_defense_token(inst.team_id, challenge, inst, tick_index)
        # Broadcast status update to AD group
        if any_update:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer
            payload = [
                {
                    "team_id": inst.team_id,
                    "status": inst.status,
                    "endpoint_url": inst.endpoint_url,
                    "last_check_at": inst.last_check_at.isoformat() if inst.last_check_at else None,
                }
                for inst in instances
            ]
            try:
                async_to_sync(get_channel_layer().group_send)(
                    f"ad.status.{challenge_id}",
                    {"type": "status.update", "payload": payload},
                )
            except Exception:
                pass

    elif challenge.mode == Challenge.MODE_KOTH:
        instances = TeamServiceInstance.objects.filter(challenge_id=challenge_id, status=TeamServiceInstance.STATUS_RUNNING)
        owner_team_id = _compute_koth_owner(list(instances), challenge.checker_config or {})
        points_hold = int((challenge.checker_config or {}).get("koth_points_per_tick", 5))
        if owner_team_id:
            # Award hold points
            from apps.core.metrics import koth_hold_ticks_total
            try:
                koth_hold_ticks_total.inc()
            except Exception:
                pass
            ScoreEvent.objects.create(
                team_id=owner_team_id,
                user=None,
                challenge_id=challenge_id,
                type=ScoreEvent.TYPE_KOTH_HOLD,
                delta=points_hold,
                metadata={"tick": tick_index},
            )
            # Handle ownership transitions (close previous, add new if changed)
            with transaction.atomic():
                prev = OwnershipEvent.objects.filter(challenge_id=challenge_id, to_ts__isnull=True).order_by("-from_ts").first()
                now = timezone.now()
                if prev and prev.owner_team_id != owner_team_id:
                    prev.to_ts = now
                    prev.save(update_fields=["to_ts"])
                    OwnershipEvent.objects.create(challenge_id=challenge_id, owner_team_id=owner_team_id, from_ts=now, points_awarded=0)
                elif not prev:
                    OwnershipEvent.objects.create(challenge_id=challenge_id, owner_team_id=owner_team_id, from_ts=now, points_awarded=0)


@shared_task
def schedule_ticks():
    """
    Periodic scheduler that computes the current tick for each AD/KotH challenge
    and dispatches run_tick for new ticks since the last processed tick.
    """
    now = timezone.now()
    challenges = Challenge.objects.exclude(mode=Challenge.MODE_JEOPARDY)
    for c in challenges:
        if not c.released_at or c.tick_seconds <= 0:
            continue
        # Compute current tick based on release time
        elapsed = (now - c.released_at).total_seconds()
        current_tick = int(elapsed // c.tick_seconds)
        # Store last processed tick in cache keyed by challenge id
        from django.core.cache import cache
        key = f"koth_ad:last_tick:{c.id}"
        last_tick = cache.get(key, -1)
        if current_tick > last_tick:
            # Dispatch ticks sequentially to avoid skipping (in case of downtime)
            for t in range(last_tick + 1, current_tick + 1):
                run_tick.delay(c.id, t)
            cache.set(key, current_tick, timeout=c.tick_seconds * 5)