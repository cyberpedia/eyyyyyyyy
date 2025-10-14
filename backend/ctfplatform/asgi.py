import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ctfplatform.settings")

django_asgi_app = get_asgi_application()

# Placeholder websocket routing (to be extended in Milestone 2)
websocket_urlpatterns = [
    # path("ws/public", PublicFeedConsumer.as_asgi()),
]

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": URLRouter(websocket_urlpatterns),
    }
)