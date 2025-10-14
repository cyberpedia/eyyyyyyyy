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