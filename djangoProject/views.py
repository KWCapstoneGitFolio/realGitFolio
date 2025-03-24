from django.http import HttpResponse

def home(request):
    return HttpResponse("GitFolio 홈 페이지입니다!")