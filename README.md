# realGitFolio

> **GitHub Repository → Developer Portfolio 자동 생성기**
>
> GitHub 활동(커밋·이슈·PR)을 분석해 **포트폴리오**를 만들어 주는 chrome web 애플리케이션입니다.

[![Stars](https://img.shields.io/github/stars/KWCapstoneGitFolio/realGitFolio?style=social)](https://github.com/KWCapstoneGitFolio/realGitFolio/stargazers)
![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python)
![Django](https://img.shields.io/badge/Django-4.x-green?logo=django)
![Last commit](https://img.shields.io/github/last-commit/KWCapstoneGitFolio/realGitFolio)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## ✨ 주요 특징

| 기능                 | 설명                                               |
| ------------------ | ------------------------------------------------ |
| GitHub OAuth Login | 개인 토큰 없이 간편 로그인 후 레포지토리 정보 수집                    |
| Repository Scanner | REST / GraphQL API로 커밋·이슈·PR 데이터 적재 (Celery 비동기) |
| LLM 요약             | **Claude v3**가 프로젝트 설명·하이라이트를 자동 작성              |
| Export             | PDF, Markdown, PNG 썸네일로 다운로드 & 공유                |

---

## 🛠️ 기술 스택

* **Backend** : Django 4, Django REST Framework, Celery + Redis, MySQL 8, python
* **AI/ML** : Anthropic Claude API, OpenAI Embeddings (태그 클러스터링)
* **Frontend** : HTML · Tailwind CSS · Alpine.js (➡ Next.js 이전 예정)
* **DevOps** : Docker Compose, GitHub Actions CI/CD, Nginx

---

## ⚡ 빠른 시작 (로컬 환경)

```bash
# 1) 클론 & 가상환경
$ git clone https://github.com/KWCapstoneGitFolio/realGitFolio.git
$ cd realGitFolio
$ python -m venv venv && source venv/bin/activate       # Windows → .\venv\Scripts\activate

# 2) 패키지 설치
(venv)$ pip install -r requirements.txt

# 3) .env 설정 (샘플: .env_readme)
#    GITHUB_TOKEN=ghp_xxx
#    ANTHROPIC_API_KEY=sk-ant-xxx
#    MYSQL_USER=gitfolio
#    MYSQL_PASSWORD=your_db_pw

# 4) DB 마이그레이션 & 서버 실행
(venv)$ python manage.py migrate
(venv)$ python manage.py runserver
```

1. 브라우저에서 [http://127.0.0.1:8000/](http://127.0.0.1:8000/) 접속 → GitHub 로그인
2. `/overview/generate` 주소창 입력 → 개인 포트폴리오 생성

---

## 🗂️ 프로젝트 구조

```text
realGitFolio/
├── core/            # 공통 헬퍼·유틸리티
├── djangoProject/   # Django 설정 모듈
├── gitFolio/        # GitHub 데이터 수집·가공
├── overview/        # LLM 프롬프트 & HTML 렌더링
├── content/         # README용 GIF·이미지
├── deploy/          # Docker & k8s 매니페스트
└── manage.py
```

---

## 🔑 환경 변수 (요약)

| 이름                  | 예시            | 설명            |
| ------------------- | ------------- | ------------- |
| `GITHUB_TOKEN`      | `ghp_xxx`     | GitHub API 토큰 |
| `ANTHROPIC_API_KEY` | `sk-ant-xxx`  | Claude API 키  |
| `MYSQL_USER`        | `gitfolio`    | DB 사용자        |
| `MYSQL_PASSWORD`    | `********`    | DB 비밀번호       |
| `MYSQL_DATABASE`    | `gitfolio_db` | DB 이름         |

> **TIP :** `.env`는 깃에 커밋하지 않도록 `.gitignore`에 추가되어 있습니다.

---

## 🧪 테스트

```bash
(venv)$ python manage.py test      # Django 기본 테스트
(venv)$ pytest                     # (예정) PyTest 이전
```

---

## 🙏 참고 & 감사

* GitHub API Docs (REST v3 / GraphQL v4)
* Anthropic Claude API Guide
* Tailwind CSS & Heroicons

---

## 서버 실행 방법

\[1] cmd에서 해당 폴더의 경로로 이동하여 아래 명령어를 실행합니다.

```bash
(1) Windows) .\venv\Scripts\activate
    MAC    ) source venv/bin/activate

(2) python manage.py runserver
```

---

## 레포지토리 개요 부분 실행 방법

\[2] 인터넷 창에 `[host]/overview/generate` 주소를 입력합니다.
\[3] 접속 완료

---

## 실행할 때 주의사항

* `.env`에서 `GITHUB_TOKEN`, `MYSQL_PASSWORD`, `ANTHROPIC_API_KEY` 부분을 자신이 설정한 키나 데이터베이스 패스워드로 바꿔주시기 바랍니다.
