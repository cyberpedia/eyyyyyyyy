# Generated initial migration for challenges app
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
from django.db.models import Q


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('core', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Category',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True)),
                ('slug', models.SlugField(max_length=140, unique=True)),
            ],
        ),
        migrations.CreateModel(
            name='Tag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True)),
            ],
        ),
        migrations.CreateModel(
            name='Challenge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('slug', models.SlugField(max_length=220, unique=True)),
                ('description', models.TextField()),
                ('scoring_model', models.CharField(choices=[('static', 'Static'), ('dynamic', 'Dynamic')], default='static', max_length=12)),
                ('points_min', models.IntegerField(default=50)),
                ('points_max', models.IntegerField(default=500)),
                ('k', models.FloatField(default=0.018)),
                ('is_dynamic', models.BooleanField(default=False)),
                ('released_at', models.DateTimeField(blank=True, null=True)),
                ('flag_hmac', models.CharField(max_length=64)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='challenges.category')),
            ],
        ),
        migrations.AddIndex(
            model_name='challenge',
            index=models.Index(fields=['slug'], name='challenges_c_slug_a0bbfe_idx'),
        ),
        migrations.CreateModel(
            name='Submission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_correct', models.BooleanField(default=False)),
                ('flag_prefix', models.CharField(blank=True, default='', max_length=16)),
                ('ip', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to='challenges.challenge')),
                ('team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to='core.team')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(fields=['challenge', '-created_at'], name='challenge_s_challen_9c2f05_idx'),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(fields=['team', '-created_at'], name='challenge_s_team_id_3d9efa_idx'),
        ),
        migrations.AddField(
            model_name='challenge',
            name='tags',
            field=models.ManyToManyField(blank=True, to='challenges.tag'),
        ),
        migrations.AddConstraint(
            model_name='submission',
            constraint=models.UniqueConstraint(condition=Q(('is_correct', True)), fields=('team', 'challenge'), name='uniq_correct_solve_per_team_challenge'),
        ),
    ]