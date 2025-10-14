from django.contrib import admin
from .models import ContentPage


@admin.register(ContentPage)
class ContentPageAdmin(admin.ModelAdmin):
    list_display = ("slug", "title", "version", "published", "updated_at")
    list_filter = ("published",)
    search_fields = ("slug", "title")