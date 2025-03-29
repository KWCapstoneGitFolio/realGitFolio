from django.urls import path
from .views import generate_overview, generate_overview_api, get_csrf_token

urlpatterns = [
    path("generate/", generate_overview, name="generate_overview"),
    path("api/generate/", generate_overview_api, name="generate_overview_api"),  
    path("csrf/", get_csrf_token, name="get_csrf_token"), 
]