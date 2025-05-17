from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from allauth.socialaccount.models import SocialToken
import requests

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_user_github_repos(request):
    try:
        token = SocialToken.objects.get(account__user=request.user, account__provider="github")
        headers = {
            "Authorization": f"Bearer {token.token}",
            "Accept": "application/vnd.github+json",
        }
        response = requests.get("https://api.github.com/user/repos", headers=headers)

        if response.status_code == 200:
            # 필요한 필드만 추려서 리턴해도 됨
            repo_list = [
                {
                    "name": r["name"],
                    "full_name": r["full_name"],
                    "private": r["private"],
                    "html_url": r["html_url"],
                    "description": r["description"],
                    "language": r["language"],
                    "updated_at": r["updated_at"],
                }
                for r in response.json()
            ]
            return Response({"repos": repo_list})
        else:
            return Response({"error": "GitHub API 요청 실패", "status": response.status_code}, status=400)

    except SocialToken.DoesNotExist:
        print("💥 GitHub 소셜 토큰 없음 — 사용자:", request.user)
        return Response({"error": "GitHub 토큰이 없습니다."}, status=401)