import os
import requests
import json
import re

def fetch_detailed_commit_history(owner, repo, username, count=20):
    import os
    import requests

    token = os.getenv('GITHUB_TOKEN')
    if not token:
        raise Exception("GitHub 토큰이 설정되지 않았습니다.")
    
    # author 필터를 제거하여 모든 커밋을 가져오도록 함
    query = f"""
    query {{
      repository(owner: "{owner}", name: "{repo}") {{
        defaultBranchRef {{
          target {{
            ... on Commit {{
              history(first: {count}) {{
                edges {{
                  node {{
                    messageHeadline
                    message
                    committedDate
                    changedFiles
                    additions
                    deletions
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
    response = requests.post(url, headers=headers, json={"query": query})
    if response.status_code != 200:
        raise Exception("GitHub API 오류: " + response.text)
    
    data = response.json()
    try:
        edges = data['data']['repository']['defaultBranchRef']['target']['history']['edges']
        commit_history = [edge['node'] for edge in edges]
    except KeyError as e:
        raise Exception("API 응답 구조 오류: " + str(e))
    
    return commit_history


def analyze_commit_messages(commits):
    # 커밋 메시지 목록 구성
    commit_messages = "\n".join([
        f"{commit['messageHeadline']} ({commit['committedDate']})" for commit in commits
    ])
    
    prompt = "\n\nHuman: 아래의 GitHub 커밋 메시지들을 분석하여 반드시 아래와 같은 JSON 형식으로 응답해주세요.\n" \
         "{\n" \
         "  \"project_overview\": \"프로젝트 개요 및 핵심 특징에 대한 서술\",\n" \
         "  \"contributions\": [\n" \
         "      { \"area\": \"기여 영역\", \"description\": \"주요 기술 기여 내용\" }\n" \
         "  ],\n" \
         "  \"tech_stack\": [\"사용된 기술 스택 목록\"],\n" \
         "  \"code_highlights\": [\"주요 코드 변경 사항 등\"]\n" \
         "}\n\n" \
         "커밋 메시지:\n" + commit_messages + "\n\nAssistant:"

    
    # Anthropnic API 호출 예제 (실제 API 엔드포인트와 요청 형식에 맞게 수정 필요)
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    if not anthropic_api_key:
        raise Exception("Anthropic API 키가 설정되지 않았습니다.")
    
    anthropic_url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": os.getenv("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01" # 올바른 버전 문자열로 수정
    }
    data = {
        "model": "claude-3-haiku-20240307",
        "system": "Optional system prompt if needed",  # 시스템 프롬프트를 최상위 필드로 전달
        "messages": [
          {"role": "user", "content": prompt}
        ],
        "max_tokens": 1000
    }
    
    response = requests.post(anthropic_url, headers=headers, json=data)
    if response.status_code != 200:
        raise Exception("Anthropic API 오류: " + response.text)
    
    try:
        response_json = response.json()
    except Exception as e:
        raise Exception("응답 JSON 파싱 실패: " + str(e))
    
    # 응답 구조가 단일 메시지인 경우
    # assistant의 메시지 텍스트는 response_json['content'][0]['text'] 형태로 포함될 수 있음
    assistant_message = None
    if "content" in response_json:
        # content는 리스트 형식으로 제공됩니다.
        for item in response_json["content"]:
            if item.get("type") == "text":
                assistant_message = item.get("text")
                break

    if not assistant_message:
        return {"error": "JSON 파싱 실패", "rawContent": response.text}
    
    # assistant_message 안에 포함된 ```json ... ``` 코드 블록 추출
    json_match = re.search(r"```json\s*([\s\S]+?)\s*```", assistant_message)
    if json_match:
        json_str = json_match.group(1)
    else:
        # 코드 블록이 없다면 전체 텍스트를 사용
        json_str = assistant_message

    try:
        analysis = json.loads(json_str)
        return analysis
    except Exception as e:
        return {"error": "JSON 파싱 실패", "rawContent": json_str}

def format_analysis_md(analysis):
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
    
    return "\n".join(md_lines)
