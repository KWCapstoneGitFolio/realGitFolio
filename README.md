## realGitFolio

# 서버 실행 방법
[1] mysql command line에서 CREATE DATABASE gitfolio_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; 쿼리문 실행  
[2] cmd에서 해당 폴더의 경로로 이동하여 아래 명령어를 실행합니다.
python manage.py runserver
  
# 레포지토리 개요 부분 실행 방법  
[2] 인터넷 창에 [host]/overview/generate 주소를 입력합니다.  
[3] 접속 완료  
  
# 실행할 때 주의사항  
- .env에서 GITHUB_TOKEN, MYSQL_PASSWORD, ANTHROPIC_API_KEY 부분을 자신이 설정된 키나 데이터베이스 패스워드로 바꿔주시기 바랍니다.  
