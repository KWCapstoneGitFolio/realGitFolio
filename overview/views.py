from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
import json
from django.middleware.csrf import get_token
from django.shortcuts import render
from .forms import RepoOverviewForm
from .utils import fetch_detailed_commit_history, analyze_commit_messages, format_analysis_md

@csrf_exempt
@require_POST
def generate_overview_api(request):
    """
    구글 확장 프로그램에서 사용할 JSON API 엔드포인트
    """
    try:
        data = json.loads(request.body)
        owner = data.get('owner')
        repo = data.get('repo')
        username = data.get('username')
        count = data.get('count', 20)
        
        if not all([owner, repo, username]):
            return JsonResponse({'error': '필수 필드가 누락되었습니다.'}, status=400)
            
        try:
            commits = fetch_detailed_commit_history(owner, repo, count)
            analysis = analyze_commit_messages(commits)
            formatted_analysis = format_analysis_md(analysis)
            
            return JsonResponse({
                'success': True,
                'analysis': formatted_analysis,
                'raw_analysis': analysis
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    except json.JSONDecodeError:
        return JsonResponse({'error': '잘못된 JSON 형식입니다.'}, status=400)

@ensure_csrf_cookie
def get_csrf_token(request):
    """
    크로스 사이트 요청 위조(CSRF) 방지를 위한 토큰을 반환하는 뷰
    """
    csrf_token = get_token(request)
    return JsonResponse({'csrfToken': csrf_token})

def generate_overview(request):
    context = {}
    if request.method == "POST":
        form = RepoOverviewForm(request.POST)
        if form.is_valid():
            owner = form.cleaned_data['owner']
            repo = form.cleaned_data['repo']
            count = form.cleaned_data.get('count') or 20
            try:
                commits = fetch_detailed_commit_history(owner, repo, count)
                analysis = analyze_commit_messages(commits)
                context['analysis_md'] = format_analysis_md(analysis)
            except Exception as e:
                context['error'] = str(e)
    else:
        form = RepoOverviewForm()
    
    context['form'] = form
    return render(request, "overview/summary.html", context)