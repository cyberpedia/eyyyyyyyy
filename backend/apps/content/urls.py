from django.urls import path

from .views import ContentPageView

urlpatterns = [
    path("content/pages/<slug:slug>", ContentPageView.as_view()),
]