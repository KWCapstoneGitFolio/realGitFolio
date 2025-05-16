from django.db import models
from django.utils import timezone

class Repository(models.Model):
    id = models.AutoField(primary_key=True)  # <-- 추가
    owner = models.CharField(max_length=100, default='Unknown')
    name = models.CharField(max_length=100, default='Unknown')
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('owner', 'name')
        managed = False
        
    def __str__(self):
        return f"{self.owner}/{self.name}"

class Commit(models.Model):
    repository = models.ForeignKey(Repository, on_delete=models.CASCADE, related_name='commits')
    sha = models.CharField(max_length=40, unique=True)
    author = models.CharField(max_length=100)
    message = models.TextField()
    committed_date = models.DateTimeField()
    additions = models.IntegerField(default=0)
    deletions = models.IntegerField(default=0)
    changed_files = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'overview_commit'  # 명시적 매핑
        managed = False # 이미 존재하는 테이블을 직접 관리하지 않음

    def __str__(self):
        return f"{self.sha[:7]} - {self.message[:50]}"

class CommitFile(models.Model):
    commit = models.ForeignKey(Commit, on_delete=models.CASCADE, related_name='files')
    filename = models.CharField(max_length=255)
    status = models.CharField(max_length=20)  # added, modified, removed
    additions = models.IntegerField(default=0)
    deletions = models.IntegerField(default=0)
    patch = models.TextField(blank=True, null=True)
    
    class Meta:
        managed = False  # 테이블이 이미 존재

    def __str__(self):
        return self.filename

class CommitAnalysis(models.Model):
    repository = models.ForeignKey(Repository, on_delete=models.CASCADE, related_name='analyses')
    username = models.CharField(max_length=100)
    commit_count = models.IntegerField(default=0)
    analysis_json = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('repository', 'username')
        managed = False  # 테이블을 수동 관리
    
    def __str__(self):
        return f"Analysis for {self.username} on {self.repository}"