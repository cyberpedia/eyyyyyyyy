from __future__ import annotations

from channels.generic.websocket import AsyncJsonWebsocketConsumer


class LeaderboardConsumer(AsyncJsonWebsocketConsumer):
    group_name = "leaderboard"

    async def connect(self):
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            # Ignore disconnect errors
            pass

    async def leaderboard_update(self, event):
        # event: { "type": "leaderboard.update", "payload": { ... } }
        payload = event.get("payload", {})
        await self.send_json(payload)


class ADStatusConsumer(AsyncJsonWebsocketConsumer):
    """
    Streams Attack-Defense service status and attack events for a given challenge id.
    Group: f"ad.status.{challenge_id}"
    """

    async def connect(self):
        # Expect URL like /ws/ad/<id>/status
        try:
            # channels URLRouter passes kwargs via scope
            cid = self.scope["url_route"]["kwargs"]["id"]
            self.group_name = f"ad.status.{cid}"
        except Exception:
            await self.close()
            return
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            pass

    async def status_update(self, event):
        payload = event.get("payload", {})
        await self.send_json({"type": "status", "payload": payload})

    async def attack_event(self, event):
        payload = event.get("payload", {})
        await self.send_json({"type": "attack", "payload": payload})


class KothStatusConsumer(AsyncJsonWebsocketConsumer):
    """
    Streams King-of-the-Hill ownership updates for a given challenge id.
    Group: f"koth.status.{challenge_id}"
    """

    async def connect(self):
        try:
            cid = self.scope["url_route"]["kwargs"]["id"]
            self.group_name = f"koth.status.{cid}"
        except Exception:
            await self.close()
            return
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            pass

    async def koth_update(self, event):
        payload = event.get("payload", {})
        await self.send_json({"type": "koth", "payload": payload})