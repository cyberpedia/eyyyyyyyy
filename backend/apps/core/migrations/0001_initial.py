# Generated initial migration for core app
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Team',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True)),
                ('slug', models.SlugField(max_length=140, unique=True)),
                ('bio', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('captain', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='captain_teams', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Membership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('member', 'Member'), ('captain', 'Captain')], default='member', max_length=16)),
                ('joined_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='core.team')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('user', 'team')},
            },
        ),
        migrations.CreateModel(
            name='ScoreEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('challenge_id', models.IntegerField(blank=True, null=True)),
                ('type', models.CharField(choices=[('solve', 'Solve'), ('first_blood', 'First Blood'), ('bonus', 'Bonus'), ('writeup_bonus', 'Write-up Bonus'), ('badge', 'Badge')], max_length=32)),
                ('delta', models.IntegerField()),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='score_events', to='core.team')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(max_length=200)),
                ('target_type', models.CharField(max_length=120)),
                ('target_id', models.CharField(max_length=120)),
                ('timestamp', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('ip', models.GenericIPAddressField(blank=True, null=True)),
                ('data', models.JSONField(blank=True, default=dict)),
                ('prev_hash', models.CharField(blank=True, default='', max_length=128)),
                ('hash', models.CharField(max_length=128)),
                ('actor_team', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.team')),
                ('actor_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name='scoreevent',
            index=models.Index(fields=['team', '-created_at'], name='core_scoree_team_id_c1b0cf_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['target_type', 'target_id'], name='core_auditl_target__50a23b_idx'),
        ),
    ]