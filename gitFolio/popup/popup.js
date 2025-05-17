document.addEventListener('DOMContentLoaded', function() {
  console.log("팝업 초기화 시작");
  const form = document.getElementById('repo-form');
  const errorMessage = document.getElementById('error-message');
  const loading = document.getElementById('loading');
  const resultContainer = document.getElementById('result-container');
  const analysisResult = document.getElementById('analysis-result');
  const autoFillBtn = document.getElementById('auto-fill-btn');
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');
  const saveBtn = document.getElementById('save-btn');

  // 사이드 패널 열기 버튼
  const openSidepanelButton = document.getElementById('open-sidepanel');
  if (openSidepanelButton) {
    console.log("사이드 패널 버튼 이벤트 리스너 설정");
    openSidepanelButton.addEventListener('click', function() {
      console.log("사이드 패널 버튼 클릭됨");
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0]) {
          console.log("현재 탭:", tabs[0].id);
          chrome.runtime.sendMessage({ 
            action: 'openSidePanel', 
            windowId: tabs[0].windowId 
          }, function(response) {
            console.log("사이드 패널 응답:", response);
            if (response && response.success) {
              console.log("사이드 패널이 열렸습니다. 팝업 닫기");
              window.close();
            } else {
              console.error('사이드 패널을 열 수 없습니다:', response ? response.error : '알 수 없는 오류');
              errorMessage.textContent = `사이드 패널을 열 수 없습니다: ${response ? response.error : '알 수 없는 오류'}`;
              errorMessage.style.display = 'block';
              setTimeout(() => {
                errorMessage.style.display = 'none';
              }, 3000);
            }
          });
        }
      });
    });
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

  async function loadSavedAnalysisList() {
  const backendUrl = await getBackendUrl();
  const response = await fetch(`${backendUrl}/overview/saved/`, { credentials: 'include' });
  if (!response.ok) {
    console.error('저장된 개요 목록 불러오기 실패:', response.status);
    return;
  }
  const data = await response.json();
  displaySavedAnalysisList(data.analyses);
}

function displaySavedAnalysisList(analyses) {
  const resultElement = document.getElementById('result');
  resultElement.innerHTML = '';

  if (!analyses.length) {
    resultElement.textContent = '저장된 개요가 없습니다.';
    return;
  }

  analyses.forEach(analysis => {
    const item = document.createElement('div');
    item.textContent = `${analysis.repository.owner}/${analysis.repository.name} - ${analysis.username}`;
    item.style.cursor = 'pointer';
    item.style.marginBottom = '8px';
    item.addEventListener('click', () => {
      loadSavedAnalysisDetail(analysis.id);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '삭제';
    deleteBtn.style.marginLeft = '8px';
    deleteBtn.addEventListener('click', () => {
      deleteSavedAnalysis(analysis.id);
    });

    item.appendChild(deleteBtn);
    resultElement.appendChild(item);
  });
}

async function loadSavedAnalysisDetail(analysisId) {
  const backendUrl = await getBackendUrl();
  const response = await fetch(`${backendUrl}/overview/api/saved/${analysisId}/`, { credentials: 'include' });
  if (!response.ok) {
    console.error('저장된 개요 불러오기 실패:', response.status);
    return;
  }
  const data = await response.json();
  document.getElementById('result').innerText = data.analysis_md;
}

async function deleteSavedAnalysis(analysisId) {
  const backendUrl = await getBackendUrl();
  const response = await fetch(`${backendUrl}/overview/api/saved/${analysisId}/delete/`, {
    method: 'POST',
    credentials: 'include'
  });

  if (response.ok) {
    console.log('삭제 성공');
    loadSavedAnalysisList();  // 목록 새로고침
  } else {
    console.error('삭제 실패:', response.status);
  }
}

  // 커밋 목록 로드 함수
  async function loadCommitList(backendUrl, owner, repo, username, count) {
    try {
      const commitListSection = document.getElementById('commit-list');
      if (!commitListSection) return; // commit-list 섹션이 없으면 무시
      
      const response = await fetch(`${backendUrl}/overview/api/commits/?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&username=${encodeURIComponent(username)}&count=${count}`);
      
      if (!response.ok) {
        console.error('커밋 목록 로드 실패:', response.status);
        return;
      }
      
      const data = await response.json();
      
      if (!data.commits || data.commits.length === 0) {
        commitListSection.innerHTML = '<p>저장된 커밋이 없습니다.</p>';
        return;
      }
      
      // 커밋 목록 생성
      let commitsHtml = `<h3>저장된 커밋 (${data.commits.length}개)</h3><div class="commit-container">`;
      
      data.commits.forEach(commit => {
        // 커밋 메시지 단축
        const shortMessage = commit.message.length > 70 
          ? commit.message.substring(0, 70) + '...' 
          : commit.message;
        
        // 날짜 포맷
        const date = new Date(commit.committed_date);
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        commitsHtml += `
          <div class="commit-item">
            <div class="commit-message">${shortMessage}</div>
            <div class="commit-details">
              <span class="commit-date">${formattedDate}</span>
              <span class="commit-stats">
                <span class="additions">+${commit.additions}</span>
                <span class="deletions">-${commit.deletions}</span>
              </span>
            </div>
          </div>
        `;
      });
      
      commitsHtml += '</div>';
      commitListSection.innerHTML = commitsHtml;
      commitListSection.style.display = 'block';
      
    } catch (error) {
      console.error('커밋 목록 로드 중 오류:', error);
    }
  }

  // 현재 GitHub 페이지에서 레포지토리 정보 가져오기
  autoFillBtn.addEventListener('click', function() {
    console.log("자동 채우기 버튼 클릭됨");
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs[0]) {
        console.error("현재 탭을 가져올 수 없습니다");
        errorMessage.textContent = '현재 탭 정보를 가져올 수 없습니다.';
        errorMessage.style.display = 'block';
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
        console.error("GitHub 레포지토리 URL이 아닙니다:", url);
        errorMessage.textContent = 'GitHub 레포지토리 페이지가 아닙니다.';
        errorMessage.style.display = 'block';
        setTimeout(() => {
          errorMessage.style.display = 'none';
        }, 3000);
      }
    });
  });

  // 커밋 분석 요청 (Django 백엔드) - 첫 번째 코드 방식
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const owner = document.getElementById('owner').value.trim();
    const repo = document.getElementById('repo').value.trim();
    const username = document.getElementById('username').value.trim();
    const count = document.getElementById('count').value;
    
    if (!owner || !repo || !username) {
      errorMessage.textContent = '모든 필드를 입력해주세요.';
      errorMessage.style.display = 'block';
      return;
    }
    
    try {
      // UI 상태 업데이트
      errorMessage.style.display = 'none';
      form.style.display = 'none';
      loading.style.display = 'flex';
      resultContainer.style.display = 'none';
      
      const backendUrl = await getBackendUrl();
      const csrfToken = await fetchCsrfToken(backendUrl);
      
      // 커밋 저장 API 호출 시도
      try {
        console.log("커밋 저장 API 호출 시도");
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
          console.warn("커밋 저장 API 오류 (무시하고 계속 진행):", saveResponse.status);
        } else {
          console.log("커밋 저장 API 호출 성공");
        }
      } catch (saveError) {
        console.warn("커밋 저장 API 호출 실패 (무시하고 계속 진행):", saveError);
      }
      
      // 기존 분석 API 호출
      const overviewEndpoint = `${backendUrl}/overview/api/generate/`;
      const response = await fetch(overviewEndpoint, {
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
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '백엔드 서버 오류가 발생했습니다.');
      }
      
      const data = await response.json();
      
      // 마크다운 결과 표시
      const marked = window.marked || await loadMarkedLibrary();
      analysisResult.innerHTML = marked.parse(data.analysis);
      
      // 결과 표시
      loading.style.display = 'none';
      resultContainer.style.display = 'block';
      
      // 커밋 목록도 표시 시도
      try {
        await loadCommitList(backendUrl, owner, repo, username, count);
      } catch (commitError) {
        console.warn("커밋 목록 로드 실패 (무시하고 계속 진행):", commitError);
      }
      
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
      loading.style.display = 'none';
      form.style.display = 'block';
      errorMessage.textContent = `오류: ${error.message}`;
      errorMessage.style.display = 'block';
    }
  });

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

  // 결과 복사 버튼
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
      }
    });
  });

  // 마크다운 다운로드 버튼
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
      }
    });
  });

  // 저장 버튼
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
          saveBtn.textContent = '저장됨!';
          setTimeout(() => {
            saveBtn.textContent = '저장하기';
          }, 2000);
        });
      } else {
        console.error("저장할 분석 결과가 없음");
      }
    });
  });

  const loadOverviewsBtn = document.getElementById('loadOverviews');
    if (loadOverviewsBtn) {
      loadOverviewsBtn.addEventListener('click', loadSavedAnalysisList);  // 이름 바꾸기
    }


  // 저장된 데이터 로드
  chrome.storage.local.get('githubUsername', function(data) {
    if (data.githubUsername) {
      console.log("저장된 GitHub 사용자명 로드:", data.githubUsername);
      document.getElementById('username').value = data.githubUsername;
    }
  });
  
  console.log("팝업 초기화 완료");
});

