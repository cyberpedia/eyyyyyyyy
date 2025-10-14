from django.urls import path

from .views import (
    RegisterView,
    LoginView,
    LogoutView,
    MeView,
    UserDetailView,
    NotificationsView,
    TeamCreateView,
    TeamDetailView,
    TeamInviteView,
    TeamJoinView,
    TeamTransferView,
)

urlpatterns = [
    path("auth/register", RegisterView.as_view()),
    path("auth/login", LoginView.as_view()),
    path("auth/logout", LogoutView.as_view()),
    path("users/me", MeView.as_view()),
    path("users/<int:id>", UserDetailView.as_view()),
    path("users/me/notifications", NotificationsView.as_view()),
    path("teams", TeamCreateView.as_view()),
    path("teams/<int:id>", TeamDetailView.as_view()),
    path("teams/<int:id>/invite", TeamInviteView.as_view()),
    path("teams/<int:id>/join", TeamJoinView.as_view()),
    path("teams/<int:id>/transfer", TeamTransferView.as_view()),
]