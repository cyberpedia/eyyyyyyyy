from django.urls import path

from .views import (
    ChallengeListView,
    ChallengeDetailView,
    FlagSubmitView,
    AdminChallengeListCreateView,
    AdminChallengeDetailView,
    AdminChallengeSnapshotView,
    LeaderboardView,
)

urlpatterns = [
    path("challenges", ChallengeListView.as_view()),
    path("challenges/<int:id>", ChallengeDetailView.as_view()),
    path("challenges/<int:id>/submit", FlagSubmitView.as_view()),
    path("leaderboard", LeaderboardView.as_view()),
    # Admin
    path("admin/challenges", AdminChallengeListCreateView.as_view()),
    path("admin/challenges/<int:id>", AdminChallengeDetailView.as_view()),
    path("admin/challenges/<int:id>/snapshot", AdminChallengeSnapshotView.as_view()),
]