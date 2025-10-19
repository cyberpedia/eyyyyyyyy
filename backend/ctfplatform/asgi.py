import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import path

from apps.challenges.consumers import LeaderboardConsumer, ADStatusConsumer, KothStatusConsumer

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ctfplatform.settings")

django_asgi_app = get_asgi_application()

# Websocket routing
websocket_urlpatterns = [
    path("ws/leaderboard", LeaderboardConsumer.as_asgi()),
    path("ws/ad/<int:id>/status", ADStatusConsumer.as_asgi()),
    path("ws/koth/<int:id>/status", KothStatusConsumer.as_asgi()),
]

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": URLRouter(websocket_urlpatterns),
    }
)