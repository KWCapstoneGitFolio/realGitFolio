from django.urls import path
from .views import generate_overview

urlpatterns = [
    path("generate/", generate_overview, name="generate_overview"),
]