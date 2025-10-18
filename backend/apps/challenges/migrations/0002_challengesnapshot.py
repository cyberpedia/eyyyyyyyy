from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('challenges', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ChallengeSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('slug', models.SlugField(max_length=220)),
                ('description', models.TextField()),
                ('scoring_model', models.CharField(max_length=12)),
                ('points_min', models.IntegerField()),
                ('points_max', models.IntegerField()),
                ('k', models.FloatField()),
                ('is_dynamic', models.BooleanField()),
                ('released_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('reason', models.CharField(choices=[('freeze', 'Freeze'), ('moderation', 'Moderation'), ('manual', 'Manual')], default='manual', max_length=16)),
                ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='snapshots', to='challenges.challenge')),
            ],
        ),
        migrations.AddIndex(
            model_name='challengesnapshot',
            index=models.Index(fields=['challenge', '-created_at'], name='challenges_c_challen_5f6c0e_idx'),
        ),
    ]