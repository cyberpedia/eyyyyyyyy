from __future__ import annotations

from django.http import Http404
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ContentPage
from .serializers import ContentPageSerializer


class ContentPageView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug: str):
        try:
            page = ContentPage.objects.get(slug=slug, published=True)
        except ContentPage.DoesNotExist:
            raise Http404
        return Response(ContentPageSerializer(page).data)