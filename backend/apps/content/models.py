from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.challenges.models import Challenge
from apps.core.models import Team


class ContentPage(models.Model):
    slug = models.SlugField(max_length=140, unique=True)
    title = models.CharField(max_length=200)
    content_md = models.TextField(blank=True, default="")
    content_json = models.JSONField(null=True, blank=True)
    version = models.IntegerField(default=1)
    published = models.BooleanField(default=True)
    updated_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.slug


class WriteUp(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="writeups")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="writeups")
    team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.SET_NULL, related_name="writeups")
    title = models.CharField(max_length=200)
    content_md = models.TextField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    moderation_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["challenge", "status", "-created_at"])]

    def __str__(self):
        return f"{self.title} ({self.status})"