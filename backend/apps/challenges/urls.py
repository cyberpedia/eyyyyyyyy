from django.urls import path

from .views import (
    ChallengeListView,
    ChallengeDetailView,
    FlagSubmitView,
    AdminChallengeListCreateView,
    AdminChallengeDetailView,
    AdminChallengeSnapshotView,
    LeaderboardView,
    ADAttackLogView,
    ADServicesStatusView,
    ADSubmitView,
    CategoriesListView,
    KothStatusView,
    KothOwnershipHistoryView,
    InstancesSpawnView,
    InstancesStopView,
    InstancesMyView,
)

urlpatterns = [
    path("challenges", ChallengeListView.as_view()),
    path("challenges/<int:id>", ChallengeDetailView.as_view()),
    path("challenges/<int:id>/submit", FlagSubmitView.as_view()),
    path("leaderboard", LeaderboardView.as_view()),
    path("categories", CategoriesListView.as_view()),
    # Attack-Defense
    path("ad/<int:id>/submit", ADSubmitView.as_view()),
    path("ad/<int:id>/attack-log", ADAttackLogView.as_view()),
    path("ad/<int:id>/services/status", ADServicesStatusView.as_view()),
    # KotH
    path("koth/<int:id>/status", KothStatusView.as_view()),
    path("koth/<int:id>/ownership-history", KothOwnershipHistoryView.as_view()),
    # Instances
    path("instances/spawn", InstancesSpawnView.as_view()),
    path("instances/stop", InstancesStopView.as_view()),
    path("instances/my", InstancesMyView.as_view()),
    # Admin
    path("admin/challenges", AdminChallengeListCreateView.as_view()),
    path("admin/challenges/<int:id>", AdminChallengeDetailView.as_view()),
    path("admin/challenges/<int:id>/snapshot", AdminChallengeSnapshotView.as_view()),
]