import os
import requests
import json
import re
from datetime import datetime
from .models import Repository, Commit, CommitFile, CommitAnalysis

def fetch_detailed_commit_history(owner, repo, username, count=20, save_to_db=True):
    """
    GitHub GraphQL API를 사용하여 커밋 히스토리를 가져오고 필요시 DB에 저장
    GitHub API에서는 author 파라미터를 통한 필터링이 복잡하므로
    모든 커밋을 가져온 다음 파이썬에서 필터링하는 방식으로 변경
    """
    token = os.getenv('GITHUB_TOKEN')
    if not token:
        raise Exception("GitHub 토큰이 설정되지 않았습니다.")
    
    # GraphQL 쿼리 구성 - 모든 커밋을 가져옴
    # 사용자 필터링은 API 응답 후 Python에서 수행
    query = f"""
    query {{
      repository(owner: "{owner}", name: "{repo}") {{
        defaultBranchRef {{
          target {{
            ... on Commit {{
              history(first: {count * 3}) {{
                edges {{
                  node {{
                    messageHeadline
                    message
                    committedDate
                    changedFiles
                    additions
                    deletions
                    oid
                    parents(first: 1) {{
                      totalCount
                    }}
                    author {{
                      name
                      email
                      user {{
                        login
                        avatarUrl
                      }}
                    }}
                    associatedPullRequests(first: 1) {{
                      nodes {{
                        title
                        number
                        url
                      }}
                    }}
                  }}
                }}
              }}
            }}
          }}
        }}
      }}
    }}
    """
    
    url = "https://api.github.com/graphql"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    # 디버깅을 위한 응답 로깅
    print(f"GitHub 토큰: {token[:5]}...")  # 토큰의 처음 5자만 출력
    
    response = requests.post(url, headers=headers, json={"query": query})
    
    # 디버깅을 위한 응답 로깅
    print(f"GitHub API Response Status: {response.status_code}")
    print(f"GitHub API Response Content: {response.text[:500]}...")  # 처음 500자만 출력
    
    if response.status_code != 200:
        raise Exception("GitHub API 오류: " + response.text)
    
    data = response.json()
    
    # 오류 처리 개선
    if 'errors' in data:
        error_messages = [error.get('message', 'Unknown error') for error in data['errors']]
        raise Exception(f"GitHub GraphQL API 오류: {', '.join(error_messages)}")
    
    # 데이터 구조 검증 및 안전하게 접근
    try:
        if 'data' not in data:
            raise Exception("API 응답에 'data' 필드가 없습니다")
        
        if 'repository' not in data['data']:
            raise Exception("API 응답에 'repository' 필드가 없습니다")
        
        repository = data['data']['repository']
        if repository is None:
            raise Exception(f"레포지토리를 찾을 수 없습니다: {owner}/{repo}")
        
        if 'defaultBranchRef' not in repository or repository['defaultBranchRef'] is None:
            raise Exception("레포지토리에 기본 브랜치가 없습니다")
        
        target = repository['defaultBranchRef']['target']
        if 'history' not in target:
            raise Exception("커밋 히스토리를 찾을 수 없습니다")
        
        history = target['history']
        if 'edges' not in history:
            raise Exception("커밋 엣지 정보를 찾을 수 없습니다")
        
        edges = history['edges']
        commit_history = [edge['node'] for edge in edges]
        
        # Python에서 username으로 필터링.  
        # 단, 매칭된 게 없으면 fallback으로 전체 커밋 중 앞(count)개를 사용.
        filtered_commits = []
        if username:
            uname = username.lower()
            for commit in commit_history:
                author = commit.get('author', {}) or {}
                user_info = author.get('user') or {}
                login = user_info.get('login', '').lower()
                name  = (author.get('name') or '').lower()
                email = (author.get('email') or '').lower()

                # 정확 일치나 포함 매칭 모두 허용
                if uname == login or uname == name or uname == email or \
                   uname in login or uname in name or uname in email:
                    filtered_commits.append(commit)
                    if len(filtered_commits) >= count:
                        break
            # 매칭된 게 없으면 fallback
            if not filtered_commits:
                filtered_commits = commit_history[:count]
        else:
            filtered_commits = commit_history[:count]
        
        # DB에 저장 옵션이 활성화된 경우
        if save_to_db:
            save_commits_to_db(owner, repo, filtered_commits)
        
        return filtered_commits
    except KeyError as e:
        raise Exception(f"API 응답 구조 오류: {str(e)}, 응답: {data}")

def save_commits_to_db(owner, repo, commits):
    """
    가져온 커밋 정보를 데이터베이스에 저장
    """
    # 저장소 정보 가져오기 또는 생성
    repository, created = Repository.objects.get_or_create(
        owner=owner,
        name=repo
    )
    
    for commit_data in commits:
        # 커밋의 기본 정보 추출
        sha = commit_data.get('oid')
        author_data = commit_data.get('author', {})
        author_user = author_data.get('user', {})
        author_login = author_user.get('login') if author_user else author_data.get('name', 'Unknown')
        
        # 이미 저장된 커밋이 있는지 확인
        commit, created = Commit.objects.get_or_create(
            repository=repository,
            sha=sha,
            defaults={
                'author': author_login,
                'message': commit_data.get('message', ''),
                'committed_date': datetime.fromisoformat(commit_data.get('committedDate').replace('Z', '+00:00')),
                'additions': commit_data.get('additions', 0),
                'deletions': commit_data.get('deletions', 0),
                'changed_files': commit_data.get('changedFiles', 0)
            }
        )
        
        # 새로 생성된 커밋인 경우 파일 정보도 가져와 저장
        if created:
            # 파일 정보는 별도 API 호출이 필요할 수 있음
            fetch_and_save_commit_files(owner, repo, sha, commit)
    
    return True

def fetch_and_save_commit_files(owner, repo, sha, commit_obj):
    """
    특정 커밋의 파일 변경 정보를 가져와 저장
    """
    token = os.getenv('GITHUB_TOKEN')
    if not token:
        raise Exception("GitHub 토큰이 설정되지 않았습니다.")
    
    url = f"https://api.github.com/repos/{owner}/{repo}/commits/{sha}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        return False
    
    commit_data = response.json()
    files = commit_data.get('files', [])
    
    for file_data in files:
        CommitFile.objects.create(
            commit=commit_obj,
            filename=file_data.get('filename', ''),
            status=file_data.get('status', 'modified'),
            additions=file_data.get('additions', 0),
            deletions=file_data.get('deletions', 0),
            patch=file_data.get('patch', '')
        )
    
    return True

def get_stored_commits(owner, repo, username=None, count=20):
    """
    데이터베이스에 저장된 커밋 정보를 조회
    """
    try:
        repository = Repository.objects.get(owner=owner, name=repo)
        queryset = Commit.objects.filter(repository=repository)
        
        if username:
            queryset = queryset.filter(author=username)
        
        return queryset.order_by('-committed_date')[:count]
    except Repository.DoesNotExist:
        return []

def analyze_commit_messages(commits, owner=None, repo=None, username=None, save_to_db=True):
    """
    커밋 메시지를 분석하여 프로젝트 정보를 추출
    Anthropic API 호출 실패 시 폴백 메커니즘 추가
    """
    # 커밋이 없는 경우 기본 분석 결과 반환
    if not commits:
        return generate_default_analysis()
    
    # 저장된 분석 결과 확인
    if save_to_db and owner and repo and username:
        try:
            repository = Repository.objects.get(owner=owner, name=repo)
            existing_analysis = CommitAnalysis.objects.filter(
                repository=repository,
                username=username
            ).first()
            
            if existing_analysis:
                print(f"기존 저장된 분석 결과를 사용합니다: {username}@{owner}/{repo}")
                return existing_analysis.analysis_json
        except (Repository.DoesNotExist, Exception) as e:
            print(f"저장된 분석 결과 검색 중 오류: {str(e)}")
    
    # 커밋 메시지 목록 구성
    commit_messages = "\n".join([
        f"{commit.get('messageHeadline', commit.get('message'))} ({commit.get('committedDate')})" if isinstance(commit, dict) else
        f"{commit.message} ({commit.committed_date})" 
        for commit in commits
    ])
    
    try:
        # Anthropic API 호출
        print(f"Anthropic API 호출 시작: {username}@{owner}/{repo}")
        analysis_result = call_anthropic_api(commit_messages, owner, repo, username, save_to_db, commits)
        print(f"Anthropic API 호출 완료: {username}@{owner}/{repo}")
        return analysis_result
    except Exception as e:
        print(f"Anthropic API 호출 실패: {str(e)}")
        # API 호출 실패 시 기본 분석 결과 반환
        default_analysis = generate_default_analysis()
        
        # 실패해도 DB에 저장 (실패 분석 결과로)
        if save_to_db and owner and repo and username:
            try:
                repository = Repository.objects.get(owner=owner, name=repo)
                CommitAnalysis.objects.update_or_create(
                    repository=repository,
                    username=username,
                    defaults={
                        'commit_count': len(commits),
                        'analysis_json': default_analysis
                    }
                )
                print(f"기본 분석 결과 저장 완료: {username}@{owner}/{repo}")
            except Exception as db_error:
                print(f"기본 분석 결과 저장 실패: {str(db_error)}")
        
        return default_analysis

def call_anthropic_api(commit_messages, owner=None, repo=None, username=None, save_to_db=True, commits=None):
    """
    Anthropic API를 호출하여 커밋 메시지 분석
    """
    # 향상된 프롬프트로 더 자세한 정보 요청
    prompt = "\n\nHuman: 아래의 GitHub 커밋 메시지들을 분석하여 반드시 아래와 같은 JSON 형식으로 응답해주세요.\n" \
         "{\n" \
         "  \"project_overview\": \"프로젝트 개요 및 핵심 특징에 대한 서술\",\n" \
         "  \"contributions\": [\n" \
         "      { \"area\": \"기여 영역\", \"description\": \"주요 기술 기여 내용\" }\n" \
         "  ],\n" \
         "  \"tech_stack\": [\"사용된 기술 스택 목록\"],\n" \
         "  \"code_highlights\": [\"주요 코드 변경 사항 등\"],\n" \
         "  \"project_structure\": \"프로젝트의 주요 구성 요소와 아키텍처 설명\",\n" \
         "  \"development_patterns\": \"개발 패턴, 코딩 스타일, 협업 방식 등\",\n" \
         "  \"testing_approach\": \"테스트 방법론이나 테스트 관련 코드 특징\",\n" \
         "  \"future_directions\": \"향후 개발 방향이나 TODO 항목\"\n" \
         "}\n\n" \
         "1. project_overview: 프로젝트의 목적, 주요 기능, 특징을 설명해주세요.\n" \
         "2. contributions: 커밋 메시지를 바탕으로 주요 기여 영역과 세부 내용을 파악해주세요.\n" \
         "3. tech_stack: 프로젝트에 사용된 기술 스택(언어, 프레임워크, 라이브러리 등)을 추정해주세요.\n" \
         "4. code_highlights: 중요한 코드 변경 사항을 요약해주세요.\n" \
         "5. project_structure: 커밋 메시지로 추정할 수 있는 프로젝트 구조와 아키텍처를 설명해주세요.\n" \
         "6. development_patterns: 개발 방식, 코딩 패턴, 협업 방식 등을 추정해주세요.\n" \
         "7. testing_approach: 테스트 관련 커밋이 있다면 테스트 방식을 추정해주세요.\n" \
         "8. future_directions: 커밋 메시지에서 향후 개발 방향이나 TODO 항목을 발견하면 요약해주세요.\n" \
         "\n커밋 메시지:\n" + commit_messages + "\n\nAssistant: "
    
    # Anthropic API 키 확인
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    if not anthropic_api_key:
        raise Exception("Anthropic API 키가 설정되지 않았습니다.")
    
    # API 요청 설정
    anthropic_url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": anthropic_api_key,
        "anthropic-version": "2023-06-01"
    }
    data = {
        "model": "claude-3-7-sonnet-20250219",
        "system": "GitHub 커밋 메시지를 분석하여 프로젝트 정보를 JSON 형태로 추출하는 도우미입니다. 모든 필드를 최대한 자세히 분석해주세요.",
        "messages": [
          {"role": "user", "content": prompt}
        ],
        "max_tokens": 1500
    }
    
    # API 요청 전송 및 응답 처리
    try:
        print("API 요청 시작...")
        response = requests.post(anthropic_url, headers=headers, json=data, timeout=30)
        print(f"API 응답 상태 코드: {response.status_code}")
        
        # 응답 상태 코드 확인
        if response.status_code != 200:
            #print(f"응답 내용: {response.text[:500]}...")
            print("응답 전체 내용:")
            print(response.text)
            raise Exception(f"Anthropic API 오류 (상태 코드 {response.status_code}): {response.text}")
        
        # 응답 파싱
        try:
            response_json = response.json()
        except json.JSONDecodeError as e:
            print(f"JSON 파싱 오류: {response.text[:500]}...")
            raise Exception(f"JSON 파싱 실패: {str(e)}")
        
        # 응답에서 텍스트 추출
        assistant_message = None
        if "content" in response_json:
            for item in response_json["content"]:
                if item.get("type") == "text":
                    assistant_message = item.get("text")
                    break

        if not assistant_message:
            raise Exception("API 응답에서 텍스트를 추출할 수 없습니다.")
        
        print(f"응답 텍스트 추출 완료: {len(assistant_message)} 자")
        
        # JSON 추출
        json_match = re.search(r"```json\s*([\s\S]+?)\s*```", assistant_message)
        if json_match:
            json_str = json_match.group(1)
            print("JSON 코드 블록 발견")
        else:
            # 코드 블록이 없다면 전체 텍스트에서 JSON 형식 찾기
            json_match = re.search(r"\{[\s\S]+?\}", assistant_message)
            if json_match:
                json_str = json_match.group(0)
                print("JSON 형식 발견")
            else:
                print(f"JSON 형식을 찾을 수 없음: {assistant_message[:200]}...")
                raise Exception("JSON 형식을 찾을 수 없습니다.")

        # JSON 파싱
        try:
            analysis = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"JSON 파싱 오류: {json_str[:500]}...")
            raise Exception(f"JSON 파싱 실패: {str(e)}")
        
        # 필수 필드 확인
        required_fields = ["project_overview", "contributions", "tech_stack", "code_highlights"]
        missing_fields = [field for field in required_fields if field not in analysis]
        if missing_fields:
            print(f"응답에 필수 필드가 누락됨: {missing_fields}")
            # 누락된 필드 추가
            default_analysis = generate_default_analysis()
            for field in missing_fields:
                analysis[field] = default_analysis[field]
        
        # DB에 분석 결과 저장
        if save_to_db and owner and repo and username and commits:
            try:
                repository = Repository.objects.get(owner=owner, name=repo)
                CommitAnalysis.objects.update_or_create(
                    repository=repository,
                    username=username,
                    defaults={
                        'commit_count': len(commits),
                        'analysis_json': analysis
                    }
                )
                print(f"분석 결과 DB 저장 완료: {username}@{owner}/{repo}")
            except Exception as db_error:
                print(f"분석 결과 DB 저장 실패: {str(db_error)}")
        
        return analysis
    
    except requests.RequestException as e:
        print(f"API 요청 오류: {str(e)}")
        raise Exception(f"API 요청 실패: {str(e)}")
    except Exception as e:
        print(f"알 수 없는 오류: {str(e)}")
        raise Exception(f"분석 중 오류 발생: {str(e)}")

def generate_default_analysis():
    """
    API 호출 실패 시 반환할 기본 분석 결과
    """
    return {
        "project_overview": "이 프로젝트는 커밋 데이터를 기반으로 분석한 결과입니다. 현재 충분한 커밋 데이터가 없거나 분석에 실패했습니다.",
        "contributions": [
            {
                "area": "코드 기여",
                "description": "코드 변경 및 파일 추가 작업이 수행되었습니다."
            }
        ],
        "tech_stack": ["C++"],
        "code_highlights": ["파일 수정 및 생성"],
        "project_structure": "프로젝트 구조는 제공된 커밋 데이터로부터 정확히 파악할 수 없습니다.",
        "development_patterns": "개발 패턴은 제공된 커밋 데이터로부터 정확히 파악할 수 없습니다.",
        "testing_approach": "테스트 접근법은 제공된 커밋 데이터로부터 정확히 파악할 수 없습니다.",
        "future_directions": "향후 개발 방향은 제공된 커밋 데이터로부터 정확히 파악할 수 없습니다."
    }

def format_analysis_md(analysis):
    """
    분석 결과를 마크다운 형식으로 변환
    """
    md_lines = []
    
    # 1. 프로젝트 개요 및 핵심 특징
    md_lines.append("# 프로젝트 개요 및 핵심 특징")
    overview = analysis.get("project_overview")
    if overview:
        md_lines.append(overview)
    else:
        md_lines.append("프로젝트 개요 정보가 제공되지 않았습니다.")
    md_lines.append("")
    
    # 2. 기여 내역
    md_lines.append("# 기여 내역")
    contributions = analysis.get("contributions")
    if contributions and isinstance(contributions, list):
        for contrib in contributions:
            area = contrib.get("area", "정보 없음")
            description = contrib.get("description", "정보 없음")
            md_lines.append(f"## {area}")
            md_lines.append(f"- **주요 기술 기여:** {description}")
            md_lines.append("")
    else:
        md_lines.append("기여 내역 정보가 제공되지 않았습니다.")
    md_lines.append("")
    
    # 3. 기술 스택
    md_lines.append("# 기술 스택")
    tech_stack = analysis.get("tech_stack")
    if tech_stack and isinstance(tech_stack, list):
        md_lines.append(", ".join(tech_stack))
    else:
        md_lines.append("기술 스택 정보가 제공되지 않았습니다.")
    md_lines.append("")
    
    # 4. 코드 기여 하이라이트
    md_lines.append("# 코드 기여 하이라이트")
    code_highlights = analysis.get("code_highlights")
    if code_highlights and isinstance(code_highlights, list):
        for highlight in code_highlights:
            md_lines.append(f"- {highlight}")
    else:
        md_lines.append("코드 기여 하이라이트 정보가 제공되지 않았습니다.")
    md_lines.append("")
    
    # 5. 새로 추가: 프로젝트 구조
    md_lines.append("# 프로젝트 구조")
    project_structure = analysis.get("project_structure")
    if project_structure:
        md_lines.append(project_structure)
    else:
        md_lines.append("프로젝트 구조 정보가 제공되지 않았습니다.")
    md_lines.append("")
    
    # 6. 새로 추가: 개발 패턴
    md_lines.append("# 개발 패턴 및 협업 방식")
    development_patterns = analysis.get("development_patterns")
    if development_patterns:
        md_lines.append(development_patterns)
    else:
        md_lines.append("개발 패턴 정보가 제공되지 않았습니다.")
    md_lines.append("")
    
    # 7. 새로 추가: 테스트 접근법
    md_lines.append("# 테스트 접근법")
    testing_approach = analysis.get("testing_approach")
    if testing_approach:
        md_lines.append(testing_approach)
    else:
        md_lines.append("테스트 접근법 정보가 제공되지 않았습니다.")
    md_lines.append("")
    
    # 8. 새로 추가: 향후 방향
    md_lines.append("# 향후 개발 방향")
    future_directions = analysis.get("future_directions")
    if future_directions:
        md_lines.append(future_directions)
    else:
        md_lines.append("향후 개발 방향 정보가 제공되지 않았습니다.")
    
    return "\n".join(md_lines)