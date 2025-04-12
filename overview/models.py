from django.db import models
from django.utils import timezone

class Repository(models.Model):
    owner = models.CharField(max_length=100, default='Unknown')
    name = models.CharField(max_length=100, default='Unknown')
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('owner', 'name')
        
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
    
    def __str__(self):
        return f"{self.sha[:7]} - {self.message[:50]}"

class CommitFile(models.Model):
    commit = models.ForeignKey(Commit, on_delete=models.CASCADE, related_name='files')
    filename = models.CharField(max_length=255)
    status = models.CharField(max_length=20)  # added, modified, removed
    additions = models.IntegerField(default=0)
    deletions = models.IntegerField(default=0)
    patch = models.TextField(blank=True, null=True)
    
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
    
    def __str__(self):
        return f"Analysis for {self.username} on {self.repository}"