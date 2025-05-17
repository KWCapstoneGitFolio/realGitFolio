from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.views.decorators.http import require_POST, require_GET
import json
import requests
import os
import traceback
from django.middleware.csrf import get_token
from django.shortcuts import render, redirect, get_object_or_404
from django.core.serializers.json import DjangoJSONEncoder
from django.forms.models import model_to_dict

from .forms import RepoOverviewForm
from .utils import (
    fetch_detailed_commit_history, analyze_commit_messages, 
    format_analysis_md, get_stored_commits, generate_default_analysis
)
from .models import Repository, Commit, CommitFile, CommitAnalysis

@require_POST
@ensure_csrf_cookie
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
            # 커밋 가져오기 & DB 저장
            commits = fetch_detailed_commit_history(owner, repo, username, count, save_to_db=True)
            
            # 분석 실행 & DB 저장 - 오류 처리 개선
            try:
                analysis = analyze_commit_messages(commits, owner, repo, username, save_to_db=True)
            except Exception as e:
                print(f"분석 중 오류 발생: {str(e)}")
                print(traceback.format_exc())
                # 오류 발생 시 기본 분석 결과 사용
                analysis = generate_default_analysis()
            
            formatted_analysis = format_analysis_md(analysis)
            
            return JsonResponse({
                'success': True,
                'analysis': formatted_analysis,
                'raw_analysis': analysis
            })
        except Exception as e:
            print(f"API 요청 처리 중 오류: {str(e)}")
            print(traceback.format_exc())
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
    """
    웹 인터페이스에서 사용할 레포지토리 개요 생성 뷰
    """
    context = {}

    # 1) 저장된 분석 링크 클릭(GET) 처리
    if request.method == "GET" and request.GET.get('owner') and request.GET.get('repo') and request.GET.get('username'):
        owner    = request.GET['owner']
        repo     = request.GET['repo']
        username = request.GET['username']
        count    = request.GET.get('count') or 20

        # 폼을 초기값으로 채우기
        form = RepoOverviewForm(initial={
            'owner': owner,
            'repo': repo,
            'username': username,
            'count': count
        })
        context['form'] = form

        # DB에서 기존 분석 결과 조회
        repository = Repository.objects.filter(owner=owner, name=repo).first()
        existing_analysis = CommitAnalysis.objects.filter(
            repository=repository,
            username=username
        ).first() if repository else None

        if existing_analysis:
            # 저장된 분석 결과를 Markdown으로 변환하여 전달
            context['analysis_md'] = format_analysis_md(existing_analysis.analysis_json)
        else:
            context['error'] = "저장된 분석이 없습니다."

        return render(request, "overview/summary.html", context)

    # 2) 신규 분석 요청(POST)
    if request.method == "POST":
        form = RepoOverviewForm(request.POST)
        context['form'] = form
        if form.is_valid():
            owner    = form.cleaned_data['owner']
            repo     = form.cleaned_data['repo']
            username = form.cleaned_data['username']
            count    = form.cleaned_data.get('count') or 20

            try:
                # 커밋 조회 및 DB 저장
                commits = fetch_detailed_commit_history(owner, repo, username, count, save_to_db=True)
                context['commits'] = commits

                # 분석 결과가 DB에 있으면 재사용, 없으면 새로 호출
                try:
                    repository = Repository.objects.filter(owner=owner, name=repo).first()
                    existing_analysis = CommitAnalysis.objects.filter(
                        repository=repository,
                        username=username
                    ).first() if repository else None

                    if existing_analysis:
                        context['warning'] = "이미 생성된 개요입니다!"
                        analysis = existing_analysis.analysis_json
                    else:
                        analysis = analyze_commit_messages(commits, owner, repo, username, save_to_db=True)

                except Exception as e:
                    print(f"분석 중 오류 발생: {e}")
                    print(traceback.format_exc())
                    analysis = generate_default_analysis()

                # Markdown으로 포맷팅
                context['analysis_md'] = format_analysis_md(analysis)

            except Exception as e:
                context['error'] = str(e)
                print(f"뷰 처리 중 오류: {e}")
                print(traceback.format_exc())

        return render(request, "overview/summary.html", context)

    # 3) 기타 GET 요청: 빈 폼 표시
    form = RepoOverviewForm()
    context['form'] = form
    return render(request, "overview/summary.html", context)

@require_GET
def commit_list_api(request):
    """
    저장소의 커밋 목록을 JSON으로 반환하는 API
    """
    owner = request.GET.get('owner')
    repo = request.GET.get('repo')
    username = request.GET.get('username')
    count = int(request.GET.get('count', 20))
    
    if not owner or not repo:
        return JsonResponse({'error': '저장소 정보가 필요합니다.'}, status=400)
    
    # DB에서 커밋 조회
    db_commits = get_stored_commits(owner, repo, username, count)
    
    # DB에 없으면 GitHub API에서 가져옴
    if not db_commits:
        try:
            raw_commits = fetch_detailed_commit_history(owner, repo, username, count)
            # API 응답을 그대로 반환 (필드 이름 변경 없이)
            return JsonResponse({'commits': raw_commits})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    
    # DB의 커밋 객체를 API 응답 형식으로 변환
    serialized_commits = []
    for commit in db_commits:
        # GitHub API 필드 이름과 일치하도록 변환
        commit_dict = {
            'oid': commit.sha,
            'author': {
                'name': commit.author,
                'user': {'login': commit.author}
            },
            'message': commit.message,
            'committedDate': commit.committed_date.isoformat(),
            'additions': commit.additions,
            'deletions': commit.deletions,
            'changedFiles': commit.changed_files
        }
        serialized_commits.append(commit_dict)
    
    return JsonResponse({'commits': serialized_commits})

@require_GET
def commit_detail_api(request, sha):
    """
    특정 커밋의 상세 정보를 JSON으로 반환하는 API
    """
    try:
        commit = get_object_or_404(Commit, sha=sha)
        
        # 커밋 정보를 GitHub API 형식과 일치하도록 변환
        commit_dict = {
            'oid': commit.sha,
            'author': {
                'name': commit.author,
                'user': {'login': commit.author}
            },
            'message': commit.message,
            'committedDate': commit.committed_date.isoformat(),
            'additions': commit.additions,
            'deletions': commit.deletions,
            'changedFiles': commit.changed_files,
            'repository': {
                'owner': commit.repository.owner,
                'name': commit.repository.name
            }
        }
        
        # 파일 정보도 포함
        commit_dict['files'] = []
        for file in commit.files.all():
            file_dict = model_to_dict(file, exclude=['commit', 'id'])
            commit_dict['files'].append(file_dict)
        
        return JsonResponse({'commit': commit_dict})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@require_POST
@ensure_csrf_cookie
def save_commits_api(request):
    """
    GitHub에서 커밋 정보를 가져와 DB에 저장하는 API
    """
    try:
        data = json.loads(request.body)
        owner = data.get('owner')
        repo = data.get('repo')
        username = data.get('username')
        count = data.get('count', 20)
        
        if not all([owner, repo]):
            return JsonResponse({'error': '저장소 정보가 필요합니다.'}, status=400)
            
        # GitHub에서 커밋 정보 가져오기 & DB 저장
        commits = fetch_detailed_commit_history(
            owner, repo, username, count, save_to_db=True
        )
        
        # 분석 실행 & DB 저장 - 오류 처리 개선
        if username:
            try:
                analysis = analyze_commit_messages(
                    commits, owner, repo, username, save_to_db=True
                )
            except Exception as e:
                print(f"분석 중 오류 발생: {str(e)}")
                print(traceback.format_exc())
                # 오류 발생 시 기본 분석 결과 사용
                analysis = generate_default_analysis()
            
            formatted_analysis = format_analysis_md(analysis)
        else:
            analysis = None
            formatted_analysis = None
        
        return JsonResponse({
            'success': True,
            'commit_count': len(commits),
            'analysis': formatted_analysis
        })
    except Exception as e:
        print(f"API 요청 처리 중 오류: {str(e)}")
        print(traceback.format_exc())
        return JsonResponse({'error': str(e)}, status=500)

@require_GET
def list_saved_analyses(request):
    analyses = (
        CommitAnalysis.objects
        .select_related('repository')
        .order_by('-created_at')
    )
    return render(request, "overview/saved_list.html", {
        'analyses': analyses
    })

@require_POST
def delete_saved_analysis(request, analysis_id):
    analysis = get_object_or_404(CommitAnalysis, id=analysis_id)
    analysis.delete()
    return redirect('list_saved_analyses')

@csrf_exempt
@require_POST
def github_token_exchange(request):
    print("GitHub 토큰 교환 요청 받음")  # 디버깅 로그
    try:
        data = json.loads(request.body)
        code = data.get('code')
        
        print(f"인증 코드: {code[:10]}...")  # 코드 일부만 출력 (보안)
        
        if not code:
            print("인증 코드 없음")
            return JsonResponse({'error': '인증 코드가 없습니다.'}, status=400)
        
        # GitHub 클라이언트 ID와 시크릿 확인
        client_id = os.getenv('GITHUB_CLIENT_ID')
        client_secret = os.getenv('GITHUB_CLIENT_SECRET')
        
        if not client_id or not client_secret:
            print("GitHub 클라이언트 ID 또는 시크릿이 설정되지 않음")
            return JsonResponse({'error': 'GitHub OAuth 설정이 완료되지 않았습니다.'}, status=500)
        
        print(f"GitHub API 요청 준비: 클라이언트 ID {client_id[:5]}...")
        
        # GitHub에 액세스 토큰 요청
        response = requests.post(
            'https://github.com/login/oauth/access_token',
            data={
                'client_id': 'Ov23liLC4Ji14gq8rjIw',
                'client_secret': 'b822ea12394ce15e64b181f5ab3fc8fcfb65a397',
                'code': code
            },
            headers={'Accept': 'application/json'}
        )
        
        print(f"GitHub API 응답 상태 코드: {response.status_code}")
        
        if response.status_code != 200:
            print(f"GitHub API 오류 응답: {response.text}")
            return JsonResponse({'error': '토큰 교환 실패'}, status=400)
        
        token_data = response.json()
        print("토큰 교환 성공: 액세스 토큰 발급됨")
        return JsonResponse(token_data)
    
    except Exception as e:
        print(f"토큰 교환 처리 중 오류: {str(e)}")
        print(traceback.format_exc())
        return JsonResponse({'error': str(e)}, status=500)

@require_GET
def list_saved_analyses_api(request):
    analyses = CommitAnalysis.objects.select_related('repository').order_by('-created_at')
    result = [{
        'id': analysis.id,
        'owner': analysis.repository.owner,
        'repo': analysis.repository.name,
        'username': analysis.username,
        'created_at': analysis.created_at.isoformat()
    } for analysis in analyses]
    return JsonResponse({'analyses': result})

@require_GET
def get_saved_analysis_api(request, analysis_id):
    analysis = get_object_or_404(CommitAnalysis, id=analysis_id)
    return JsonResponse({
        'id': analysis.id,
        'owner': analysis.repository.owner,
        'repo': analysis.repository.name,
        'username': analysis.username,
        'commit_count': analysis.commit_count,
        'analysis': analysis.analysis_json,
        'markdown': format_analysis_md(analysis.analysis_json)
    })

@require_http_methods(["DELETE"])
def delete_saved_analysis_api(request, analysis_id):
    analysis = get_object_or_404(CommitAnalysis, id=analysis_id)
    analysis.delete()
    return JsonResponse({'success': True})