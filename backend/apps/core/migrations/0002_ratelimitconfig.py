# Generated migration for RateLimitConfig
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='RateLimitConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('scope', models.CharField(max_length=64, unique=True)),
                ('user_rate', models.CharField(blank=True, default='', max_length=32)),
                ('ip_rate', models.CharField(blank=True, default='', max_length=32)),
                ('updated_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
        ),
    ]