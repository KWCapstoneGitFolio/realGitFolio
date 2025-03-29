# views.py에 추가
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
import json

@require_POST
@ensure_csrf_cookie
def generate_overview_api(request):
    try:
        data = json.loads(request.body)
        owner = data.get('owner')
        repo = data.get('repo')
        username = data.get('username')
        count = data.get('count', 20)
        
        if not all([owner, repo, username]):
            return JsonResponse({'error': '필수 필드가 누락되었습니다.'}, status=400)
            
        try:
            commits = fetch_detailed_commit_history(owner, repo, username, count)
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