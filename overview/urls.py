from django.urls import path
from .views import (
    generate_overview, generate_overview_api, get_csrf_token,
    commit_list_api, commit_detail_api, save_commits_api,
    list_saved_analyses, delete_saved_analysis, github_token_exchange,
    list_saved_analyses_api, get_saved_analysis_api, delete_saved_analysis_api,
)

urlpatterns = [
    path("generate/", generate_overview, name="generate_overview"),
    path("api/generate/", generate_overview_api, name="generate_overview_api"),  
    path("csrf/", get_csrf_token, name="get_csrf_token"), 
    path("saved/",    list_saved_analyses,    name="list_saved_analyses"),
    path("saved/delete/<int:analysis_id>/", delete_saved_analysis, name="delete_saved_analysis"),

    # 커밋 관련 API 추가
    path("api/commits/", commit_list_api, name="commit_list_api"),
    path("api/commits/<str:sha>/", commit_detail_api, name="commit_detail_api"),
    path("api/save-commits/", save_commits_api, name="save_commits_api"),
    path("auth/github/token/", github_token_exchange, name="github_token_exchange"),

    path("api/saved/", list_saved_analyses_api, name="list_saved_analyses_api"),
    path("api/saved/<int:analysis_id>/", get_saved_analysis_api, name="get_saved_analysis_api"),
    path("api/saved/<int:analysis_id>/delete/", delete_saved_analysis_api, name="delete_saved_analysis_api"),

]