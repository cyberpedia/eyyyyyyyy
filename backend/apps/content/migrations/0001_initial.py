# Generated initial migration for content app
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='ContentPage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(max_length=140, unique=True)),
                ('title', models.CharField(max_length=200)),
                ('content_md', models.TextField(blank=True, default='')),
                ('content_json', models.JSONField(blank=True, null=True)),
                ('version', models.IntegerField(default=1)),
                ('published', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
        ),
    ]