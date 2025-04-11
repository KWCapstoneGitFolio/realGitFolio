from django.urls import path
from .views import (
    generate_overview, generate_overview_api, get_csrf_token,
    commit_list_api, commit_detail_api, save_commits_api
)

urlpatterns = [
    path("generate/", generate_overview, name="generate_overview"),
    path("api/generate/", generate_overview_api, name="generate_overview_api"),  
    path("csrf/", get_csrf_token, name="get_csrf_token"), 
    
    # 커밋 관련 API 추가
    path("api/commits/", commit_list_api, name="commit_list_api"),
    path("api/commits/<str:sha>/", commit_detail_api, name="commit_detail_api"),
    path("api/save-commits/", save_commits_api, name="save_commits_api"),
]