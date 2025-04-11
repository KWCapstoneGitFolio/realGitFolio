from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST, require_GET
import json
import traceback
from django.middleware.csrf import get_token
from django.shortcuts import render, get_object_or_404
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
    if request.method == "POST":
        form = RepoOverviewForm(request.POST)
        if form.is_valid():
            owner = form.cleaned_data['owner']
            repo = form.cleaned_data['repo']
            username = form.cleaned_data['username']
            count = form.cleaned_data.get('count') or 20
            try:
                # 커밋 가져오기 & DB 저장 - API 응답 구조를 그대로 유지
                commits = fetch_detailed_commit_history(owner, repo, username, count, save_to_db=True)
                context['commits'] = commits
                
                # 분석 실행 & DB 저장 - 오류 처리 개선
                try:
                    # DB에 저장된 분석 결과가 있는지 확인
                    try:
                        repository = Repository.objects.get(owner=owner, name=repo)
                        existing_analysis = CommitAnalysis.objects.filter(
                            repository=repository, 
                            username=username
                        ).first()
                        
                        if existing_analysis:
                            analysis = existing_analysis.analysis_json
                            print("DB에 저장된 분석 결과를 사용합니다.")
                        else:
                            # 새로 분석 실행
                            analysis = analyze_commit_messages(commits, owner, repo, username, save_to_db=True)
                    except (Repository.DoesNotExist, CommitAnalysis.DoesNotExist):
                        # 저장소 또는 분석 결과가 없으면 새로 분석
                        analysis = analyze_commit_messages(commits, owner, repo, username, save_to_db=True)
                    
                except Exception as e:
                    print(f"분석 중 오류 발생: {str(e)}")
                    print(traceback.format_exc())
                    # 오류 발생 시 기본 분석 결과 사용
                    analysis = generate_default_analysis()
                
                formatted_analysis = format_analysis_md(analysis)
                context['analysis'] = formatted_analysis
            except Exception as e:
                context['error'] = str(e)
                print(f"뷰 처리 중 오류: {str(e)}")
                print(traceback.format_exc())
    else:
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