from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('challenges', '0003_multi_modes'),
    ]

    operations = [
        migrations.CreateModel(
            name='RoundTick',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tick_index', models.BigIntegerField()),
                ('started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('finished_at', models.DateTimeField(blank=True, null=True)),
                ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='round_ticks', to='challenges.challenge')),
            ],
        ),
        migrations.AddIndex(
            model_name='roundtick',
            index=models.Index(fields=['challenge', '-tick_index'], name='challenges_r_challen_8f6df1_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='roundtick',
            unique_together={('challenge', 'tick_index')},
        ),
    ]