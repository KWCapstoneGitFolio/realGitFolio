# Generated by Django 5.1.7 on 2025-04-05 15:39

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='User',
            fields=[
                ('user_id', models.CharField(max_length=20, primary_key=True, serialize=False)),
                ('nickname', models.CharField(max_length=20)),
            ],
        ),
        migrations.CreateModel(
            name='Repository',
            fields=[
                ('repo_id', models.AutoField(primary_key=True, serialize=False)),
                ('repo_content', models.TextField()),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='repositories', to='overview.user')),
            ],
        ),
        migrations.CreateModel(
            name='Contribution',
            fields=[
                ('con_id', models.AutoField(primary_key=True, serialize=False)),
                ('con_content', models.TextField()),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='contributions', to='overview.user')),
            ],
        ),
    ]
