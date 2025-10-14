from __future__ import annotations

from django.db import models
from django.utils import timezone


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