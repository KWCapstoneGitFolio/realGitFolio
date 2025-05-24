// DOM 요소 참조
const loginContainer = document.getElementById('login-container');
const mainContainer = document.getElementById('main-container');
const repoForm = document.getElementById('repo-form');
const generateBtn = document.getElementById('generate-btn');
const autoFillBtn = document.getElementById('auto-fill-btn');
const loadingEl = document.getElementById('loading');
const resultContainer = document.getElementById('result-container');
const analysisResult = document.getElementById('analysis-result');
const copyBtn = document.getElementById('copy-btn');
const downloadBtn = document.getElementById('download-btn');
const saveBtn = document.getElementById('save-btn');
const commitListSection = document.getElementById('commit-list');
const errorMessage = document.getElementById('error-message');
const noLoginWarning = document.getElementById('no-login-warning');
const githubLoginBtn = document.getElementById('github-login-btn');
const skipLoginBtn = document.getElementById('skip-login-btn');
const savedListContainer = document.getElementById('saved-list-container');
const savedListResult = document.getElementById('saved-list-result');
const goToSavedListBtn = document.getElementById('go-to-saved-list');
const backToMainBtn = document.getElementById('back-to-main');

// 초기화 함수
document.addEventListener('DOMContentLoaded', function() {
  console.log('사이드 패널 초기화');
  
  // 로그인 상태 확인
  checkLoginStatus();
  
  // 폼 제출 이벤트 리스너
  if (repoForm) {
    repoForm.addEventListener('submit', handleFormSubmit);
  }
  
  // 자동 채우기 버튼 이벤트 리스너
  if (autoFillBtn) {
    autoFillBtn.addEventListener('click', autoFillFromCurrentPage);
  }
  
  // GitHub 로그인 버튼 이벤트 리스너
  if (githubLoginBtn) {
    githubLoginBtn.addEventListener('click', initiateGitHubOAuth);
  }
  
  // 로그인 건너뛰기 버튼 이벤트 리스너
  if (skipLoginBtn) {
    skipLoginBtn.addEventListener('click', skipLogin);
  }
  
  // 복사 버튼 이벤트 리스너
  if (copyBtn) {
    copyBtn.addEventListener('click', copyResultToClipboard);
  }
  
  // 다운로드 버튼 이벤트 리스너
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadResultAsMarkdown);
  }
  
  // 저장 버튼 이벤트 리스너
  if (saveBtn) {
    saveBtn.addEventListener('click', saveAnalysisResult);
  }
  
  // 저장된 개요 목록 버튼 이벤트 리스너
  if (goToSavedListBtn) {
    goToSavedListBtn.addEventListener('click', function() {
      showSavedList();
    });
  }
  
  // 뒤로가기 버튼 이벤트 리스너
  if (backToMainBtn) {
    backToMainBtn.addEventListener('click', function() {
      mainContainer.style.display = 'block';
      savedListContainer.style.display = 'none';
    });
  }
});

// 로그인 상태 확인
function checkLoginStatus() {
  chrome.storage.local.get(['githubToken', 'skipLogin'], function(data) {
    if (data.githubToken) {
      // 토큰이 있으면 로그인 상태로 간주
      showMainInterface(true);
    } else if (data.skipLogin) {
      // 로그인 건너뛰기 상태
      showMainInterface(false);
    } else {
      // 로그인 화면 표시
      loginContainer.style.display = 'block';
      mainContainer.style.display = 'none';
    }
    
    // 현재 페이지가 GitHub인지 확인하고 자동 채우기
    checkCurrentPage();
  });
}

// GitHub OAuth 인증 시작
function initiateGitHubOAuth() {
  getBackendUrl().then(backendUrl => {
    // Chrome 확장 프로그램의 리다이렉트 URL
    const redirectUrl = chrome.identity.getRedirectURL();
    
    // GitHub 인증 URL 생성
    const authUrl = 
      `https://github.com/login/oauth/authorize?client_id=Ov23liLC4Ji14gq8rjIw&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=repo,user`;
    
    console.log("인증 URL:", authUrl);
    
    // Chrome Identity API를 사용하여 인증 진행
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true
      },
      function(responseUrl) {
        if (chrome.runtime.lastError) {
          console.error("인증 오류:", chrome.runtime.lastError);
          showError("GitHub 로그인에 실패했습니다.");
          return;
        }
        
        if (responseUrl) {
          // URL에서 코드 추출
          const url = new URL(responseUrl);
          const code = url.searchParams.get('code');
          
          if (code) {
            // 코드를 액세스 토큰으로 교환
            exchangeCodeForToken(code, backendUrl);
          } else {
            showError("인증 코드를 받을 수 없습니다.");
          }
        }
      }
    );
  });
}

// 인증 코드를 액세스 토큰으로 교환
async function exchangeCodeForToken(code, backendUrl) {
  try {
    console.log("토큰 교환 요청 URL:", `${backendUrl}/overview/auth/github/token/`);
    
    // 백엔드 서버에 코드 전송하여 토큰 교환 요청
    const response = await fetch(`${backendUrl}/overview/auth/github/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });
    
    console.log("토큰 교환 응답 상태:", response.status);
    
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
    showError(`로그인 처리 오류: ${error.message}`);
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
    
    // 사용자 정보 저장
    chrome.storage.local.set({
      githubUsername: userData.login,
      isLoggedIn: true
    }, function() {
      // 사용자 정보 가져오기 성공 후 메인 인터페이스 표시
      showMainInterface(true);
      
      // 사용자 이름 필드 업데이트
      const usernameField = document.getElementById('username');
      if (usernameField) {
        usernameField.value = userData.login;
      }
    });
  } catch (error) {
    console.error("사용자 프로필 가져오기 오류:", error);
    // 오류가 있어도 메인 인터페이스는 표시
    showMainInterface(false);
  }
}

// 로그인 건너뛰기
function skipLogin() {
  chrome.storage.local.set({ skipLogin: true }, function() {
    showMainInterface(false);
  });
}

// 메인 인터페이스 표시
function showMainInterface(isLoggedIn) {
  loginContainer.style.display = 'none';
  mainContainer.style.display = 'block';
  
  if (!isLoggedIn && noLoginWarning) {
    noLoginWarning.style.display = 'block';
  } else if (noLoginWarning) {
    noLoginWarning.style.display = 'none';
  }
  
  // 마지막 분석 결과 불러오기
  loadLastAnalysisResult();
}

// 폼 제출 처리
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const owner = document.getElementById('owner').value.trim();
  const repo = document.getElementById('repo').value.trim();
  const username = document.getElementById('username').value.trim();
  const count = document.getElementById('count').value;
  
  if (!owner || !repo || !username) {
    showError('모든 필수 필드를 입력해주세요.');
    return;
  }
  
  try {
    // UI 상태 업데이트
    hideError();
    loadingEl.style.display = 'flex';
    resultContainer.style.display = 'none';
    commitListSection.style.display = 'none';
    
    // 백엔드 URL 및 CSRF 토큰 가져오기
    const backendUrl = await getBackendUrl();
    const csrfToken = await fetchCsrfToken(backendUrl);
    
    // 1. 먼저 커밋 저장 API 호출
    await saveCommits(backendUrl, csrfToken, owner, repo, username, count);
    
    // 2. 개요 생성 API 호출
    const apiParams = {
      owner,
      repo,
      username,
      count: parseInt(count)
    };
    
    const overviewEndpoint = `${backendUrl}/overview/api/generate/`;
    
    const response = await fetch(overviewEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken,
      },
      body: JSON.stringify(apiParams),
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.error || '백엔드 서버 오류가 발생했습니다.');
      } catch (e) {
        throw new Error(`서버 오류 (${response.status}): ${errorText.substr(0, 100)}`);
      }
    }
    
    const data = await response.json();
    
    // 마크다운 결과 표시
    analysisResult.innerHTML = marked.parse(data.analysis);
    
    // 결과 표시
    loadingEl.style.display = 'none';
    resultContainer.style.display = 'block';
    
    // 3. 커밋 목록 표시
    await loadCommitList(backendUrl, owner, repo, username, count);
    
    // 분석 데이터 저장
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
    
  } catch (error) {
    console.error("처리 중 오류 발생:", error);
    loadingEl.style.display = 'none';
    showError(`오류: ${error.message}`);
  }
}

// 백엔드 URL 가져오기
async function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get('backendUrl', function(data) {
      // 기본값: localhost:8000
      const url = data.backendUrl || 'http://localhost:8000';
      resolve(url);
    });
  });
}

// Django CSRF 토큰 가져오기
async function fetchCsrfToken(backendUrl) {
  try {
    // CSRF 토큰 쿠키 가져오기
    const response = await fetch(`${backendUrl}/overview/csrf/`, { 
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('CSRF 토큰을 가져오는데 실패했습니다.');
    }
    
    const data = await response.json();
    return data.csrfToken;
  } catch (error) {
    console.error('CSRF 토큰 에러:', error);
    throw error;
  }
}

// 커밋 저장 함수
async function saveCommits(backendUrl, csrfToken, owner, repo, username, count) {
  try {
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
    
    if (!saveResponse.ok) {
      console.warn("커밋 저장 API 오류:", saveResponse.status);
      return false;
    }
    
    return true;
  } catch (error) {
    console.warn("커밋 저장 API 호출 실패:", error);
    return false;
  }
}

// 커밋 목록 로드 함수
async function loadCommitList(backendUrl, owner, repo, username, count) {
  try {
    const commitUrl = `${backendUrl}/overview/api/commits/?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&username=${encodeURIComponent(username)}&count=${count}`;
    
    // 로딩 메시지 표시
    commitListSection.innerHTML = '<p>커밋 목록을 불러오는 중...</p>';
    commitListSection.style.display = 'block';
    
    const response = await fetch(commitUrl, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      commitListSection.innerHTML = '<p>커밋 정보를 가져오는데 실패했습니다.</p>';
      return;
    }
    
    const data = await response.json();
    
    if (!data.commits || data.commits.length === 0) {
      commitListSection.innerHTML = '<p>저장된 커밋이 없습니다.</p>';
      return;
    }
    
    // 커밋 목록 생성
    let commitsHtml = `<h3>커밋 목록 (${data.commits.length}개)</h3><div class="commit-container">`;
    
    data.commits.forEach(commit => {
      try {
        // 커밋 메시지 단축
        const message = commit.message || "메시지 없음";
        const shortMessage = message.length > 70 
          ? message.substring(0, 70) + '...' 
          : message;
        
        // 날짜 포맷
        const commitDate = new Date(commit.committedDate);
        const formattedDate = `${commitDate.getFullYear()}-${String(commitDate.getMonth() + 1).padStart(2, '0')}-${String(commitDate.getDate()).padStart(2, '0')}`;
        
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
      }
    });
    
    commitsHtml += '</div>';
    commitListSection.innerHTML = commitsHtml;
    commitListSection.style.display = 'block';
  } catch (error) {
    console.error('커밋 목록 로드 중 오류:', error);
    commitListSection.innerHTML = '<p>커밋 목록을 불러오는 중 오류가 발생했습니다.</p>';
    commitListSection.style.display = 'block';
  }
}

// 자동 채우기 함수
function autoFillFromCurrentPage() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || !tabs[0]) return;
    
    const url = tabs[0].url;
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    
    if (match) {
      const owner = match[1];
      const repo = match[2].split('/')[0]; // URL 경로 제거
      
      document.getElementById('owner').value = owner;
      document.getElementById('repo').value = repo;
      
      // 사용자명 필드가 비어있으면 GitHub 사용자명 가져오기
      if (!document.getElementById('username').value) {
        chrome.storage.local.get('githubUsername', function(data) {
          if (data.githubUsername) {
            document.getElementById('username').value = data.githubUsername;
          }
        });
      }
    }
  });
}

// 현재 페이지 확인
function checkCurrentPage() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0] && tabs[0].url) {
      const url = tabs[0].url;
      
      if (url.includes('github.com')) {
        setTimeout(function() {
          autoFillFromCurrentPage();
        }, 500); // UI가 표시된 후 약간의 지연을 두고 실행
      }
    }
  });
}

// 마지막 분석 결과 로드
function loadLastAnalysisResult() {
  chrome.storage.local.get('lastAnalysis', function(data) {
    if (data.lastAnalysis && data.lastAnalysis.markdown) {
      try {
        // 마크다운 렌더링
        analysisResult.innerHTML = marked.parse(data.lastAnalysis.markdown);
        resultContainer.style.display = 'block';
        
        // 폼 필드 업데이트
        if (data.lastAnalysis.owner) {
          document.getElementById('owner').value = data.lastAnalysis.owner;
        }
        
        if (data.lastAnalysis.repo) {
          document.getElementById('repo').value = data.lastAnalysis.repo;
        }
        
        if (data.lastAnalysis.username) {
          document.getElementById('username').value = data.lastAnalysis.username;
        }
      } catch (error) {
        console.error("마지막 분석 결과 로드 실패:", error);
      }
    }
  });
}

// 분석 결과 복사
function copyResultToClipboard() {
  chrome.storage.local.get('lastAnalysis', function(data) {
    if (data.lastAnalysis && data.lastAnalysis.markdown) {
      navigator.clipboard.writeText(data.lastAnalysis.markdown)
        .then(() => {
          showToast('분석 결과가 클립보드에 복사되었습니다.');
        })
        .catch(err => {
          showError(`복사 실패: ${err}`);
        });
    } else {
      showToast('복사할 분석 결과가 없습니다.', true);
    }
  });
}

// 마크다운 다운로드
function downloadResultAsMarkdown() {
  chrome.storage.local.get('lastAnalysis', function(data) {
    if (data.lastAnalysis && data.lastAnalysis.markdown) {
      const blob = new Blob([data.lastAnalysis.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.lastAnalysis.repo}-overview.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      showToast('다운로드할 분석 결과가 없습니다.', true);
    }
  });
}

// 분석 결과 저장
function saveAnalysisResult() {
  chrome.storage.local.get(['savedAnalyses', 'lastAnalysis'], function(data) {
    if (data.lastAnalysis) {
      const savedAnalyses = data.savedAnalyses || [];
      savedAnalyses.push({
        ...data.lastAnalysis,
        id: Date.now().toString()
      });
      
      chrome.storage.local.set({ savedAnalyses }, function() {
        showToast('분석 결과가 저장되었습니다.');
      });
    } else {
      showToast('저장할 분석 결과가 없습니다.', true);
    }
  });
}

// 저장된 개요 목록 화면 표시 함수
async function showSavedList() {
  // 메인 컨테이너 숨기기
  mainContainer.style.display = 'none';
  
  // 저장된 개요 목록 컨테이너 표시
  savedListContainer.style.display = 'block';
  
  // 로딩 표시
  savedListResult.innerHTML = '<div class="loading-inline"><div class="spinner small"></div><p>저장된 개요 목록을 불러오는 중...</p></div>';
  
  try {
    // 백엔드에서 저장된 개요 목록 가져오기
    const analyses = await fetchSavedAnalyses();
    
    // 목록 표시
    displaySavedAnalyses(analyses);
  } catch (error) {
    console.error('저장된 개요 목록을 불러오는 중 오류 발생:', error);
    savedListResult.innerHTML = `<div class="error-message">저장된 개요 목록을 불러오는 중 오류가 발생했습니다: ${error.message}</div>`;
  }
}

// 백엔드에서 저장된 개요 목록 가져오기
async function fetchSavedAnalyses() {
  const backendUrl = await getBackendUrl();
  const url = `${backendUrl}/overview/api/saved/`;
  
  console.log('저장된 개요 목록 요청 URL:', url);
  
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error(`서버 응답 오류: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('저장된 개요 목록 응답:', data);
  
  return data.analyses;
}

// 저장된 개요 목록 화면에 표시
function displaySavedAnalyses(analyses) {
  if (!analyses || analyses.length === 0) {
    savedListResult.innerHTML = '<div class="empty-state">저장된 개요가 없습니다.</div>';
    return;
  }
  
  let html = '<div class="analyses-list">';
  
  analyses.forEach(analysis => {
    // 날짜 포맷팅
    const date = new Date(analysis.created_at);
    const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    html += `
      <div class="analysis-item" data-id="${analysis.id}">
        <div class="analysis-header">
          <h3 class="repo-name">${analysis.owner}/${analysis.repo}</h3>
          <span class="analysis-date">${formattedDate}</span>
        </div>
        <div class="analysis-info">
          <span class="username">사용자: ${analysis.username}</span>
          <span class="commit-count">커밋 수: ${analysis.commit_count || 'N/A'}</span>
        </div>
        <div class="tech-stack">
          ${analysis.tech_stack && analysis.tech_stack.length > 0 ? 
            `<div class="tech-tags">
              ${analysis.tech_stack.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
            </div>` : 
            '<span class="no-tech">기술 스택 정보 없음</span>'
          }
        </div>
        <div class="analysis-actions">
          <button class="load-analysis-btn">불러오기</button>
          <button class="delete-analysis-btn">삭제</button>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  
  // HTML 삽입
  savedListResult.innerHTML = html;
  
  // 불러오기 버튼 이벤트 리스너
  const loadButtons = savedListResult.querySelectorAll('.load-analysis-btn');
  loadButtons.forEach(button => {
    button.addEventListener('click', function() {
      const analysisId = this.closest('.analysis-item').dataset.id;
      loadSavedAnalysis(analysisId);
    });
  });
  
  // 삭제 버튼 이벤트 리스너
  const deleteButtons = savedListResult.querySelectorAll('.delete-analysis-btn');
  deleteButtons.forEach(button => {
    button.addEventListener('click', function() {
      const analysisId = this.closest('.analysis-item').dataset.id;
      confirmDeleteAnalysis(analysisId);
    });
  });
}

// 저장된 개요 불러오기
async function loadSavedAnalysis(analysisId) {
  try {
    // 로딩 표시
    savedListResult.innerHTML = '<div class="loading-inline"><div class="spinner small"></div><p>저장된 개요를 불러오는 중...</p></div>';
    
    // 백엔드에서 저장된 개요 상세 정보 가져오기
    const backendUrl = await getBackendUrl();
    const url = `${backendUrl}/overview/api/saved/${analysisId}/`;
    
    console.log('저장된 개요 상세 정보 요청 URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }
    
    const analysis = await response.json();
    console.log('저장된 개요 상세 정보:', analysis);
    
    // 폼 필드 채우기
    document.getElementById('owner').value = analysis.owner;
    document.getElementById('repo').value = analysis.repo;
    document.getElementById('username').value = analysis.username;
    if (analysis.commit_count) {
      document.getElementById('count').value = analysis.commit_count;
    }
    
    // 마크다운 렌더링
    analysisResult.innerHTML = marked.parse(analysis.markdown);
    
    // 커밋 목록 가져오기
    await loadCommitList(backendUrl, analysis.owner, analysis.repo, analysis.username, analysis.commit_count || 20);
    
    // 화면 전환
    savedListContainer.style.display = 'none';
    mainContainer.style.display = 'block';
    resultContainer.style.display = 'block';
    
    // 알림 표시
    showToast('저장된 개요를 불러왔습니다.');
    
    // 로컬 스토리지에 최근 분석 정보 저장
    chrome.storage.local.set({
      lastAnalysis: {
        owner: analysis.owner,
        repo: analysis.repo,
        username: analysis.username,
        markdown: analysis.markdown,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('저장된 개요를 불러오는 중 오류 발생:', error);
    savedListResult.innerHTML = `<div class="error-message">저장된 개요를 불러오는 중 오류가 발생했습니다: ${error.message}</div>`;
  }
}

// 개요 삭제 확인
function confirmDeleteAnalysis(analysisId) {
  if (confirm('이 개요를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
    deleteSavedAnalysis(analysisId);
  }
}

// 저장된 개요 삭제
async function deleteSavedAnalysis(analysisId) {
  try {
    // 백엔드에서 CSRF 토큰 가져오기
    const backendUrl = await getBackendUrl();
    const csrfToken = await fetchCsrfToken(backendUrl);
    
    // 삭제 요청
    const url = `${backendUrl}/overview/api/saved/${analysisId}/delete/`;
    
    console.log('개요 삭제 요청 URL:', url);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-CSRFToken': csrfToken
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }
    
    // 목록 새로고침
    showToast('개요가 삭제되었습니다.');
    showSavedList();
    
  } catch (error) {
    console.error('개요 삭제 중 오류 발생:', error);
    showToast('개요 삭제 중 오류가 발생했습니다: ' + error.message, true);
  }
}

// 오류 표시
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

// 오류 숨기기
function hideError() {
  errorMessage.style.display = 'none';
}

// 토스트 메시지 표시
function showToast(message, isError = false) {
  // 기존 토스트 메시지 제거
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    document.body.removeChild(existingToast);
  }
  
  // 새 토스트 메시지 생성
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
  toast.textContent = message;
  
  // 토스트 메시지 추가
  document.body.appendChild(toast);
  
  // 토스트 메시지 표시
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  // 토스트 메시지 제거
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 3000);
}