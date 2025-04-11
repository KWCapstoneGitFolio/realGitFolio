import os
import requests
import re

def fetch_detailed_commit_history(owner, repo, count=20):
    token = os.getenv('GITHUB_TOKEN')
    if not token:
        raise Exception("GitHub 토큰이 설정되지 않았습니다.")
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
                  }}
                }}
              }}
            }}
          }}
        }}
      }}
    }}
    """
    resp = requests.post(
        "https://api.github.com/graphql",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json={"query": query}
    )
    if resp.status_code != 200:
        raise Exception(f"GitHub API 오류: {resp.text}")
    data = resp.json()
    try:
        edges = data['data']['repository']['defaultBranchRef']['target']['history']['edges']
        return [edge['node'] for edge in edges]
    except KeyError as e:
        raise Exception("API 응답 구조 오류: " + str(e))


def analyze_commit_messages(commits):
    # 커밋 메시지 목록 조합
    messages = "\n".join(
        f"- **{c['messageHeadline']}** ({c['committedDate']})" for c in commits
    )

    prompt = (
        "아래 GitHub 커밋 기록을 보고, **Markdown 형식**으로 프로젝트 전반의 개요와 핵심 특징, "
        "상세 기술 스택을 각각 섹션으로 나누어 작성해주세요.\n\n"
        "```\n" + messages + "\n```\n\n"
        "출력 예시:\n"
        "## 프로젝트 개요 및 핵심 특징\n"
        "- 설명1\n"
        "- 설명2\n\n"
        "## 기술 스택\n"
        "- Python 3.10\n"
        "- Django 4.x\n"
        "- PostgreSQL\n\n"
        "이와 같은 형태로, 가능한 한 상세히 작성해 주세요."
    )

    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    if not anthropic_api_key:
        raise Exception("Anthropic API 키가 설정되지 않았습니다.")

    response = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "Content-Type": "application/json",
            "x-api-key": anthropic_api_key,
            "anthropic-version": "2023-06-01"
        },
        json={
            "model": "claude-3-7-sonnet-20250219",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1500
        }
    )
    
    anthropic_url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": os.getenv("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01" # 올바른 버전 문자열로 수정
    }
    data = {
        "model": "claude-3-7-sonnet-20250219",
        "system": "Optional system prompt if needed",  # 시스템 프롬프트를 최상위 필드로 전달
        "messages": [
          {"role": "user", "content": prompt}
        ],
        "max_tokens": 1000
    }
    
    response = requests.post(anthropic_url, headers=headers, json=data)
    if response.status_code != 200:
        raise Exception("Anthropic API 오류: " + response.text)

    resp_json = response.json()
    # Claude 응답에서 텍스트 부분 추출
    text = ""
    if "content" in resp_json:
        for item in resp_json["content"]:
            if item.get("type") == "text":
                text = item.get("text")
                break
    if not text:
        raise Exception("응답에서 텍스트를 찾을 수 없습니다.")

    # 응답 텍스트가 Markdown이라 가정하고 그대로 반환
    return text.strip()


def format_analysis_md(markdown_text):
    """
    이미 Markdown 형식으로 생성된 텍스트를 그대로 반환합니다.
    """
    return markdown_text