## ERD를 적용하여 모델 정의한 부분

from django.db import models

class User(models.Model):
    user_id = models.CharField(max_length=20, primary_key=True)
    nickname = models.CharField(max_length=20)

class Repository(models.Model):
    repo_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='repositories')
    repo_content = models.TextField()

class Contribution(models.Model):
    con_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='contributions')
    con_content = models.TextField()