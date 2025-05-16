document.addEventListener('DOMContentLoaded', function() {
  console.log("사이드 패널 초기화 시작");
  
  // 요소 참조
  const loginContainer = document.getElementById('login-container');
  const mainContainer = document.getElementById('main-container');
  const githubLoginBtn = document.getElementById('github-login-btn');
  const skipLoginBtn = document.getElementById('skip-login-btn');
  const repoForm = document.getElementById('repo-form');
  const generateBtn = document.getElementById('generate-btn');
  const autoFillBtn = document.getElementById('auto-fill-btn');
  const loadingIndicator = document.getElementById('loading');
  const resultContainer = document.getElementById('result-container');
  const analysisResult = document.getElementById('analysis-result');
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');
  const saveBtn = document.getElementById('save-btn');
  const errorMessage = document.getElementById('error-message');
  const commitListSection = document.getElementById('commit-list');
  const noLoginWarning = document.getElementById('no-login-warning');
  
  // 로그인 상태 확인
  checkLoginStatus();
  
  // 로그인 버튼 이벤트 리스너
if (githubLoginBtn) {
  githubLoginBtn.addEventListener('click', function() {
    console.log("GitHub 로그인 버튼 클릭됨");
    initiateGitHubOAuth();
  });
}

// GitHub OAuth 인증 시작 함수
function initiateGitHubOAuth() {
  // GitHub 개발자 설정에서 생성한 클라이언트 ID
  const clientId = 'Ov23liLC4Ji14gq8rjIw';
  
  // Chrome 확장 프로그램의 리다이렉트 URL
  const redirectUrl = chrome.identity.getRedirectURL();
  console.log("OAuth 리다이렉트 URL:", redirectUrl);
  
  // 요청할 권한 범위
  const scope = 'repo,user';
  
  // GitHub 인증 URL 생성
  const authUrl = 
    `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=${scope}`;
  
  // Chrome Identity API를 사용하여 인증 진행
  chrome.identity.launchWebAuthFlow(
    {
      url: authUrl,
      interactive: true
    },
    function(responseUrl) {
      if (chrome.runtime.lastError) {
        console.error("인증 오류:", chrome.runtime.lastError);
        errorMessage.textContent = "GitHub 로그인에 실패했습니다.";
        errorMessage.style.display = 'block';
        return;
      }
      
      if (responseUrl) {
        // URL에서 코드 추출
        const url = new URL(responseUrl);
        const code = url.searchParams.get('code');
        
        if (code) {
          // 코드를 액세스 토큰으로 교환
          exchangeCodeForToken(code);
        } else {
          console.error("인증 코드가 없습니다");
          errorMessage.textContent = "인증 코드를 받을 수 없습니다.";
          errorMessage.style.display = 'block';
        }
      }
    }
  );
}

// 인증 코드를 액세스 토큰으로 교환
async function exchangeCodeForToken(code) {
  try {
    // 백엔드 URL 가져오기
    const backendUrl = await getBackendUrl();
    
    // 백엔드 서버에 코드 전송하여 토큰 교환 요청
    const response = await fetch(`${backendUrl}/overview/auth/github/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });
    
    if (!response.ok) {
      throw new Error(`토큰 교환 실패: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.access_token) {
      // 액세스 토큰 저장
      chrome.storage.local.set({
        githubToken: data.access_token,
        tokenTimestamp: Date.now()
      }, function() {
        console.log("GitHub 토큰 저장됨");
        
        // 토큰을 사용하여 사용자 정보 가져오기
        fetchUserProfile(data.access_token);
      });
    } else {
      throw new Error("액세스 토큰이 응답에 없습니다.");
    }
  } catch (error) {
    console.error("토큰 교환 오류:", error);
    errorMessage.textContent = `로그인 처리 오류: ${error.message}`;
    errorMessage.style.display = 'block';
  }
}

// GitHub API를 사용하여 사용자 프로필 가져오기
async function fetchUserProfile(token) {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`사용자 정보 가져오기 실패: ${response.status}`);
    }
    
    const userData = await response.json();
    console.log("GitHub 사용자 정보:", userData);
    
    // 사용자 정보 저장
    chrome.storage.local.set({
      githubUsername: userData.login,
      githubAvatar: userData.avatar_url,
      githubName: userData.name || userData.login,
      isLoggedIn: true
    }, function() {
      console.log("GitHub 사용자 정보 저장됨");
      
      // 사용자 정보 가져오기 성공 후 메인 인터페이스 표시
      showMainInterface(true);
      
      // 사용자 이름 필드 업데이트
      const usernameField = document.getElementById('username');
      if (usernameField) {
        usernameField.value = userData.login;
      }
      
      // 경고 메시지 숨기기
      if (noLoginWarning) {
        noLoginWarning.style.display = 'none';
      }
    });
  } catch (error) {
    console.error("사용자 프로필 가져오기 오류:", error);
    // 오류가 있어도 메인 인터페이스는 표시
    showMainInterface(false);
  }
}
  // 로그인 건너뛰기 버튼 이벤트 리스너
  if (skipLoginBtn) {
    skipLoginBtn.addEventListener('click', function() {
      console.log("로그인 건너뛰기 버튼 클릭됨");
      showMainInterface(false);
    });
  }
  
  // 로그인 상태 확인 함수
  function checkLoginStatus() {
    console.log("로그인 상태 확인 중...");
    chrome.storage.local.get(['githubToken', 'githubUsername'], function(data) {
      const isLoggedIn = data.githubToken && data.githubUsername;
      console.log("로그인 상태:", isLoggedIn ? "로그인됨" : "로그인되지 않음");
      
      // 저장된 상태가 있으면 바로 메인 인터페이스 표시
      if (isLoggedIn) {
        showMainInterface(true);
      } else {
        // 자동 로그인 설정이 있는지 확인
        chrome.storage.local.get('skipLogin', function(data) {
          if (data.skipLogin) {
            showMainInterface(false);
          } else {
            // 로그인 화면 표시
            loginContainer.style.display = 'flex';
            mainContainer.style.display = 'none';
          }
        });
      }
      
      // 현재 GitHub 페이지인지 확인하고 자동 채우기
      checkCurrentPage();
    });
  }
  
  // 현재 페이지가 GitHub인지 확인하고 자동으로 필드 채우기
  function checkCurrentPage() {
    console.log("현재 페이지 확인 중...");
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs[0] && tabs[0].url) {
        const url = tabs[0].url;
        console.log("현재 탭 URL:", url);
        
        if (url.includes('github.com')) {
          console.log("GitHub 페이지 감지됨, 자동 채우기 시도");
          setTimeout(function() {
            autoFillFromCurrentPage();
          }, 500); // UI가 표시된 후 약간의 지연을 두고 실행
        }
      }
    });
  }
  
  // 메인 인터페이스 표시 함수
  function showMainInterface(isLoggedIn) {
    loginContainer.style.display = 'none';
    mainContainer.style.display = 'block';
    
    // 로그인 없이 사용 중이면 경고 메시지 표시
    if (!isLoggedIn && noLoginWarning) {
      noLoginWarning.style.display = 'block';
    }
    
    // 이전 분석 결과 불러오기
    loadLastAnalysisResult();
  }
  
  // 백엔드 서버 URL 가져오기
  async function getBackendUrl() {
    return new Promise((resolve) => {
      chrome.storage.local.get('backendUrl', function(data) {
        // 기본값: localhost:8000
        const url = data.backendUrl || 'http://localhost:8000';
        console.log("백엔드 URL:", url);
        resolve(url);
      });
    });
  }
  
  // 안전한 날짜 파싱 함수
  function formatDate(dateString) {
    try {
      // ISO 형식인지 확인
      if (!dateString) return "날짜 없음";
      
      // 시간 문자열 디버깅
      console.log("날짜 파싱 시도:", dateString);
      
      // ISO 문자열 변환 시도
      const date = new Date(dateString);
      
      // 유효한 날짜인지 확인
      if (isNaN(date.getTime())) {
        console.warn("유효하지 않은 날짜:", dateString);
        return "날짜 오류";
      }
      
      // 형식화된 날짜 반환
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    } catch (error) {
      console.error("날짜 파싱 오류:", error);
      return "날짜 오류";
    }
  }
  
  // 커밋 목록 로드 함수
  async function loadCommitList(backendUrl, owner, repo, username, count) {
    try {
      // commitListSection 참조 갱신
      const commitListSection = document.getElementById('commit-list');
      
      if (!commitListSection) {
        console.error("commit-list 섹션을 찾을 수 없습니다");
        return; // commit-list 섹션이 없으면 무시
      }
      
      console.log("커밋 목록 로드 시도 중...", { owner, repo, username, count });
      const commitUrl = `${backendUrl}/overview/api/commits/?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&username=${encodeURIComponent(username)}&count=${count}`;
      console.log("커밋 API URL:", commitUrl);
      
      // 로딩 메시지 표시
      commitListSection.innerHTML = '<p>커밋 목록을 불러오는 중...</p>';
      commitListSection.style.display = 'block';
      
      const response = await fetch(commitUrl, {
        method: 'GET',
        credentials: 'include'
      });
      
      console.log("커밋 API 응답 상태:", response.status);
      
      if (!response.ok) {
        console.warn('커밋 목록 로드 실패:', response.status);
        commitListSection.innerHTML = '<p>커밋 정보를 가져오는데 실패했습니다.</p>';
        return;
      }
      
      const data = await response.json();
      console.log("커밋 API 응답 데이터:", data);
      
      if (!data.commits || data.commits.length === 0) {
        console.log("저장된 커밋이 없습니다");
        commitListSection.innerHTML = '<p>저장된 커밋이 없습니다.</p>';
        return;
      }
      
      console.log(`커밋 ${data.commits.length}개 로드됨`);
      
      // 첫 번째 커밋 데이터 확인 (디버깅 용도)
      if (data.commits.length > 0) {
        console.log("첫 번째 커밋 데이터 샘플:", JSON.stringify(data.commits[0]));
      }
      
      // 커밋 목록 생성
      let commitsHtml = `<h3>저장된 커밋 (${data.commits.length}개)</h3><div class="commit-container">`;
      
      data.commits.forEach(commit => {
        try {
          // 커밋 메시지 단축
          const message = commit.message || "메시지 없음";
          const shortMessage = message.length > 70 
            ? message.substring(0, 70) + '...' 
            : message;
          
          // 날짜 포맷 (안전한 파싱 적용)
          const formattedDate = formatDate(commit.committed_date);
          
          // 통계 값 안전하게 가져오기
          const additions = typeof commit.additions === 'number' ? commit.additions : 0;
          const deletions = typeof commit.deletions === 'number' ? commit.deletions : 0;
          
          commitsHtml += `
            <div class="commit-item">
              <div class="commit-message">${shortMessage}</div>
              <div class="commit-details">
                <span class="commit-date">${formattedDate}</span>
                <span class="commit-stats">
                  <span class="additions">+${additions}</span>
                  <span class="deletions">-${deletions}</span>
                </span>
              </div>
            </div>
          `;
        } catch (itemError) {
          console.error("커밋 항목 처리 오류:", itemError, commit);
          // 오류나도 계속 진행
        }
      });
      
      commitsHtml += '</div>';
      commitListSection.innerHTML = commitsHtml;
      commitListSection.style.display = 'block';
      console.log("커밋 목록 표시 완료");
    } catch (error) {
      console.error('커밋 목록 로드 중 오류:', error);
      // commitListSection 참조 갱신
      const commitListSection = document.getElementById('commit-list');
      if (commitListSection) {
        commitListSection.innerHTML = '<p>커밋 목록을 불러오는 중 오류가 발생했습니다.</p>';
        commitListSection.style.display = 'block';
      }
    }
  }
  
  // 커밋 저장 함수
  async function saveCommits(backendUrl, csrfToken, owner, repo, username, count) {
    try {
      console.log("커밋 저장 시도 중...");
      const saveResponse = await fetch(`${backendUrl}/overview/api/save-commits/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken,
        },
        body: JSON.stringify({
          owner,
          repo,
          username,
          count: parseInt(count)
        }),
        credentials: 'include'
      });
      
      console.log("커밋 저장 API 응답 상태:", saveResponse.status);
      
      if (!saveResponse.ok) {
        console.warn("커밋 저장 API 오류:", saveResponse.status);
        return false;
      }
      
      try {
        const saveData = await saveResponse.json();
        console.log("커밋 저장 응답 데이터:", saveData);
      } catch (e) {
        console.warn("커밋 저장 응답을 JSON으로 파싱할 수 없음");
      }
      
      console.log("커밋 저장 API 호출 성공");
      return true;
    } catch (error) {
      console.warn("커밋 저장 API 호출 실패:", error);
      return false;
    }
  }
  
  // Django CSRF 토큰 가져오기
  async function fetchCsrfToken(backendUrl) {
    try {
      // CSRF 토큰 쿠키 가져오기
      console.log("CSRF 토큰 요청:", `${backendUrl}/overview/csrf/`);
      const response = await fetch(`${backendUrl}/overview/csrf/`, { 
        method: 'GET',
        credentials: 'include'
      });
      
      console.log("CSRF 응답 상태:", response.status);
      
      if (!response.ok) {
        console.error("CSRF 토큰 응답 오류:", response.status);
        throw new Error('CSRF 토큰을 가져오는데 실패했습니다.');
      }
      
      const data = await response.json();
      console.log("CSRF 토큰 응답 받음");
      return data.csrfToken;
    } catch (error) {
      console.error('CSRF 토큰 에러:', error);
      throw error;
    }
  }
  
  // marked.js 라이브러리 로드
  async function loadMarkedLibrary() {
    console.log("marked.js 라이브러리 확인 중...");
    
    // 이미 로드되어 있는지 확인
    if (window.marked) {
      console.log("marked.js 라이브러리가 이미 로드되어 있습니다.");
      return window.marked;
    }
    
    // 라이브러리가 로드되어 있지 않으면 내장된 파일 사용
    return new Promise((resolve, reject) => {
      try {
        console.log("내장 marked.js 라이브러리 로드 시도...");
        const script = document.createElement('script');
        script.src = '../lib/marked.min.js';
        script.onload = () => {
          console.log("내장 marked.js 라이브러리 로드 완료");
          resolve(window.marked);
        };
        script.onerror = (e) => {
          console.error("내장 marked.js 로드 실패:", e);
          
          // 실패 시 CDN 시도
          console.log("CDN에서 marked.js 로드 시도...");
          const cdnScript = document.createElement('script');
          cdnScript.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
          cdnScript.onload = () => {
            console.log("CDN marked.js 로드 완료");
            resolve(window.marked);
          };
          cdnScript.onerror = (err) => {
            console.error("CDN marked.js 로드 실패:", err);
            reject(new Error("마크다운 라이브러리 로드에 실패했습니다."));
          };
          document.head.appendChild(cdnScript);
        };
        document.head.appendChild(script);
      } catch (error) {
        console.error("marked.js 로드 중 오류:", error);
        reject(error);
      }
    });
  }
  
  // 폼 제출 이벤트 리스너
  if (repoForm) {
    repoForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const owner = document.getElementById('owner').value.trim();
      const repo = document.getElementById('repo').value.trim();
      const username = document.getElementById('username').value.trim();
      const count = document.getElementById('count').value;
      
      console.log("폼 데이터:", { owner, repo, username, count });
      
      if (!owner || !repo || !username) {
        console.error("필수 필드 누락");
        errorMessage.textContent = '모든 필드를 입력해주세요.';
        errorMessage.style.display = 'block';
        return;
      }
      
      try {
        // UI 상태 업데이트
        errorMessage.style.display = 'none';
        loadingIndicator.style.display = 'flex';
        resultContainer.style.display = 'none';
        
        // commitListSection 참조 갱신
        const commitListSection = document.getElementById('commit-list');
        if (commitListSection) {
          commitListSection.style.display = 'none';
        }
        
        // 타임아웃 설정
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error("요청 타임아웃");
          controller.abort();
        }, 60000); // 60초 타임아웃
        
        // 백엔드 URL 및 CSRF 토큰 가져오기
        console.log("백엔드 URL 가져오는 중...");
        const backendUrl = await getBackendUrl();
        console.log("백엔드 URL:", backendUrl);
        
        console.log("CSRF 토큰 요청 중...");
        const csrfToken = await fetchCsrfToken(backendUrl);
        console.log("CSRF 토큰 받음");
        
        // 1. 먼저 커밋 저장 API 호출
        console.log("커밋 저장 API 호출 중...");
        await saveCommits(backendUrl, csrfToken, owner, repo, username, count);
        
        // 2. 개요 생성 API 호출
        console.log("개요 생성 API 호출 중...");
        const apiParams = {
          owner,
          repo,
          username,
          count: parseInt(count)
        };
        
        const overviewEndpoint = `${backendUrl}/overview/api/generate/`;
        console.log("API 엔드포인트:", overviewEndpoint);
        
        console.log("API 요청 보내는 중...");
        const response = await fetch(overviewEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
          },
          body: JSON.stringify(apiParams),
          credentials: 'include',
          signal: controller.signal
        });
        
        // 타임아웃 제거
        clearTimeout(timeoutId);
        
        console.log("API 응답 상태:", response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("API 오류 응답:", errorText);
          try {
            const errorData = JSON.parse(errorText);
            throw new Error(errorData.error || '백엔드 서버 오류가 발생했습니다.');
          } catch (e) {
            throw new Error(`서버 오류 (${response.status}): ${errorText.substr(0, 100)}`);
          }
        }
        
        console.log("API 응답 파싱 중...");
        const data = await response.json();
        console.log("API 응답 데이터 받음");
        
        // 마크다운 결과 표시
        console.log("마크다운 파서 로드 중...");
        const marked = window.marked || await loadMarkedLibrary();
        console.log("마크다운 파싱 중...");
        analysisResult.innerHTML = marked.parse(data.analysis);
        
        // 결과 표시
        console.log("결과 표시 중...");
        loadingIndicator.style.display = 'none';
        resultContainer.style.display = 'block';
        
        // 3. 커밋 목록 표시 - 약간 지연시켜 UI 업데이트 시간 확보
        console.log("커밋 목록 불러오는 중...");
        setTimeout(async () => {
          await loadCommitList(backendUrl, owner, repo, username, count);
        }, 500);
        
        // 분석 데이터 저장
        console.log("분석 결과 저장 중...");
        chrome.storage.local.set({
          lastAnalysis: {
            owner,
            repo,
            username,
            markdown: data.analysis,
            timestamp: new Date().toISOString()
          }
        });
        
        // GitHub 사용자명 저장
        chrome.storage.local.set({ githubUsername: username });
        console.log("처리 완료");
        
      } catch (error) {
        console.error("처리 중 오류 발생:", error);
        
        if (error.name === 'AbortError') {
          errorMessage.textContent = '요청 시간이 초과되었습니다. 서버 연결을 확인하세요.';
        } else {
          errorMessage.textContent = `오류: ${error.message}`;
        }
        
        loadingIndicator.style.display = 'none';
        errorMessage.style.display = 'block';
      }
    });
  }
  
  // 현재 GitHub 페이지에서 레포지토리 정보 가져오기
  function autoFillFromCurrentPage() {
    console.log("자동 채우기 함수 호출됨");
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs[0]) {
        console.error("현재 탭을 가져올 수 없습니다");
        return;
      }
      
      const url = tabs[0].url;
      console.log("현재 탭 URL:", url);
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      
      if (match) {
        const owner = match[1];
        const repo = match[2].split('/')[0]; // URL 경로 제거
        console.log("추출된 레포지토리 정보:", owner, repo);
        
        document.getElementById('owner').value = owner;
        document.getElementById('repo').value = repo;
        
        // 사용자명 필드가 비어있으면 GitHub 사용자명 가져오기
        if (!document.getElementById('username').value) {
          chrome.storage.local.get('githubUsername', function(data) {
            if (data.githubUsername) {
              console.log("저장된 GitHub 사용자명 사용:", data.githubUsername);
              document.getElementById('username').value = data.githubUsername;
            }
          });
        }
      } else {
        console.log("GitHub 레포지토리 URL이 아닙니다:", url);
      }
    });
  }
  
  // 자동 채우기 버튼 이벤트 리스너
  if (autoFillBtn) {
    autoFillBtn.addEventListener('click', function() {
      console.log("자동 채우기 버튼 클릭됨");
      autoFillFromCurrentPage();
    });
  }
  
  // 결과 복사 버튼
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      console.log("복사 버튼 클릭됨");
      chrome.storage.local.get('lastAnalysis', function(data) {
        if (data.lastAnalysis && data.lastAnalysis.markdown) {
          navigator.clipboard.writeText(data.lastAnalysis.markdown)
            .then(() => {
              console.log("클립보드에 복사 성공");
              copyBtn.textContent = '복사됨!';
              setTimeout(() => {
                copyBtn.textContent = '결과 복사';
              }, 2000);
            })
            .catch(err => {
              console.error("클립보드 복사 실패:", err);
              errorMessage.textContent = `복사 실패: ${err}`;
              errorMessage.style.display = 'block';
            });
        } else {
          console.error("복사할 분석 결과가 없음");
          showToast("복사할 분석 결과가 없습니다.", true);
        }
      });
    });
  }
  
  // 마크다운 다운로드 버튼
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      console.log("다운로드 버튼 클릭됨");
      chrome.storage.local.get('lastAnalysis', function(data) {
        if (data.lastAnalysis && data.lastAnalysis.markdown) {
          console.log("마크다운 다운로드 준비 중");
          const blob = new Blob([data.lastAnalysis.markdown], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${data.lastAnalysis.repo}-overview.md`;
          a.click();
          URL.revokeObjectURL(url);
          console.log("다운로드 완료");
        } else {
          console.error("다운로드할 분석 결과가 없음");
          showToast("다운로드할 분석 결과가 없습니다.", true);
        }
      });
    });
  }
  
  // 저장 버튼
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      console.log("저장 버튼 클릭됨");
      chrome.storage.local.get(['savedAnalyses', 'lastAnalysis'], function(data) {
        if (data.lastAnalysis) {
          console.log("분석 결과 저장 중");
          const savedAnalyses = data.savedAnalyses || [];
          savedAnalyses.push({
            ...data.lastAnalysis,
            id: Date.now().toString()
          });
          
          chrome.storage.local.set({ savedAnalyses }, function() {
            console.log("분석 결과 저장 완료");
            showToast("분석 결과가 저장되었습니다.");
            saveBtn.textContent = '저장됨!';
            setTimeout(() => {
              saveBtn.textContent = '저장하기';
            }, 2000);
          });
        } else {
          console.error("저장할 분석 결과가 없음");
          showToast("저장할 분석 결과가 없습니다.", true);
        }
      });
    });
  }
  
  // 메시지 리스너
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log("사이드 패널 메시지 수신:", message);
    
    if (message.action === 'analysisResultUpdated') {
      // 분석 결과 업데이트
      if (message.data && message.data.analysisMarkdown) {
        displayAnalysis(message.data.analysisMarkdown);
      }
    }
    return true;
  });
  
  // 마지막 분석 결과 로드
  function loadLastAnalysisResult() {
    chrome.storage.local.get('lastAnalysis', async function(data) {
      if (data.lastAnalysis && data.lastAnalysis.markdown) {
        console.log("저장된 마지막 분석 결과 불러오기");
        try {
          const marked = window.marked || await loadMarkedLibrary();
          analysisResult.innerHTML = marked.parse(data.lastAnalysis.markdown);
          resultContainer.style.display = 'block';
          
          // GitHub 사용자명 자동 입력
          if (data.lastAnalysis.username) {
            document.getElementById('username').value = data.lastAnalysis.username;
          }
          
          // 저장소 정보 자동 입력
          if (data.lastAnalysis.owner) {
            document.getElementById('owner').value = data.lastAnalysis.owner;
          }
          
          if (data.lastAnalysis.repo) {
            document.getElementById('repo').value = data.lastAnalysis.repo;
          }
          
          // 마지막 분석의 커밋 목록도 로드
          if (data.lastAnalysis.owner && data.lastAnalysis.repo && data.lastAnalysis.username) {
            try {
              const backendUrl = await getBackendUrl();
              const count = data.lastAnalysis.count || 10; // 저장된 값 또는 기본값
              await loadCommitList(backendUrl, data.lastAnalysis.owner, data.lastAnalysis.repo, data.lastAnalysis.username, count);
            } catch (commitErr) {
              console.warn("이전 분석 커밋 목록 로드 실패:", commitErr);
            }
          }
        } catch (error) {
          console.error("마지막 분석 결과 로드 실패:", error);
        }
      }
    });
  }
  
  // 분석 결과 표시 함수
  async function displayAnalysis(markdown) {
    try {
      const marked = window.marked || await loadMarkedLibrary();
      analysisResult.innerHTML = marked.parse(markdown);
      resultContainer.style.display = 'block';
      console.log("분석 결과 표시됨");
    } catch (error) {
      console.error("분석 결과 표시 실패:", error);
      errorMessage.textContent = `분석 결과 표시 실패: ${error.message}`;
      errorMessage.style.display = 'block';
    }
  }
  
  // 토스트 메시지 표시
  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = isError ? 'toast toast-error' : 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }
  
  // 저장된 GitHub 사용자명 로드
  chrome.storage.local.get('githubUsername', function(data) {
    if (data.githubUsername) {
      console.log("저장된 GitHub 사용자명 로드:", data.githubUsername);
      document.getElementById('username').value = data.githubUsername;
    }
  });
  
  console.log("사이드 패널 초기화 완료");
});