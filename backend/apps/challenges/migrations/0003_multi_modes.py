from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
        ('challenges', '0002_challengesnapshot'),
    ]

    operations = [
        # Add multi-mode fields to Challenge
        migrations.AddField(
            model_name='challenge',
            name='mode',
            field=models.CharField(choices=[('JEOPARDY', 'Jeopardy'), ('ATTACK_DEFENSE', 'Attack-Defense'), ('KOTH', 'King of the Hill')], default='JEOPARDY', max_length=32),
        ),
        migrations.AddField(
            model_name='challenge',
            name='tick_seconds',
            field=models.PositiveIntegerField(default=60),
        ),
        migrations.AddField(
            model_name='challenge',
            name='instance_required',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='challenge',
            name='checker_config',
            field=models.JSONField(blank=True, default=dict),
        ),
        # Create TeamServiceInstance
        migrations.CreateModel(
            name='TeamServiceInstance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('running', 'Running'), ('error', 'Error'), ('stopped', 'Stopped')], default='pending', max_length=32)),
                ('endpoint_url', models.URLField(blank=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('last_check_at', models.DateTimeField(blank=True, null=True)),
                ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='service_instances', to='challenges.challenge')),
                ('team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='service_instances', to='core.team')),
            ],
        ),
        migrations.AddIndex(
            model_name='teamserviceinstance',
            index=models.Index(fields=['challenge', 'team'], name='challenges_t_challen_94d5fd_idx'),
        ),
        # Create DefenseToken
        migrations.CreateModel(
            name='DefenseToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tick', models.BigIntegerField()),
                ('token', models.CharField(max_length=128)),
                ('minted_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('expires_at', models.DateTimeField()),
                ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='defense_tokens', to='challenges.challenge')),
                ('instance', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='challenges.teamserviceinstance')),
                ('team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='defense_tokens', to='core.team')),
            ],
        ),
        migrations.AddIndex(
            model_name='defensetoken',
            index=models.Index(fields=['challenge', 'team', 'tick'], name='challenges_d_challen_8f13c7_idx'),
        ),
        migrations.AddIndex(
            model_name='defensetoken',
            index=models.Index(fields=['token'], name='challenges_d_token_5a34f7_idx'),
        ),
        # Create AttackEvent
        migrations.CreateModel(
            name='AttackEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tick', models.BigIntegerField()),
                ('token_hash', models.CharField(max_length=128)),
                ('points_awarded', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('attacker_team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attacks', to='core.team')),
                ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attack_events', to='challenges.challenge')),
                ('victim_team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='victim_attacks', to='core.team')),
            ],
        ),
        migrations.AddIndex(
            model_name='attackevent',
            index=models.Index(fields=['challenge', '-created_at'], name='challenges_a_challen_7c15a8_idx'),
        ),
        # Create OwnershipEvent
        migrations.CreateModel(
            name='OwnershipEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('from_ts', models.DateTimeField()),
                ('to_ts', models.DateTimeField(blank=True, null=True)),
                ('points_awarded', models.IntegerField(default=0)),
                ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ownership_events', to='challenges.challenge')),
                ('owner_team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='koth_ownerships', to='core.team')),
            ],
        ),
        migrations.AddIndex(
            model_name='ownershipevent',
            index=models.Index(fields=['challenge', '-from_ts'], name='challenges_o_challen_3b2c9a_idx'),
        ),
    ]