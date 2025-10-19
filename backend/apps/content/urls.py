from django.urls import path

from .views import (
    ContentPageView,
    ChallengeWriteUpsView,
    WriteUpModerateView,
    WriteUpsAdminListView,
    WriteUpAuditLogView,
    WriteUpAuditLogCsvView,
)

urlpatterns = [
    path("content/pages/<slug:slug>", ContentPageView.as_view()),
    path("content/challenges/<int:id>/writeups", ChallengeWriteUpsView.as_view()),
    path("content/writeups/<int:id>/moderate", WriteUpModerateView.as_view()),
    path("content/writeups", WriteUpsAdminListView.as_view()),
    path("content/writeups/<int:id>/audit", WriteUpAuditLogView.as_view()),
    path("content/writeups/<int:id>/audit.csv", WriteUpAuditLogCsvView.as_view()),
]