document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('repo-form');
    const errorMessage = document.getElementById('error-message');
    const loading = document.getElementById('loading');
    const resultContainer = document.getElementById('result-container');
    const analysisResult = document.getElementById('analysis-result');
    const autoFillBtn = document.getElementById('auto-fill-btn');
    const copyBtn = document.getElementById('copy-btn');
    const downloadBtn = document.getElementById('download-btn');
    const saveBtn = document.getElementById('save-btn');
  
    // 백엔드 서버 URL 가져오기
    async function getBackendUrl() {
      return new Promise((resolve) => {
        chrome.storage.local.get('backendUrl', function(data) {
          // 기본값: localhost:8000
          resolve(data.backendUrl || 'http://localhost:8000');
        });
      });
    }
  
    // 현재 GitHub 페이지에서 레포지토리 정보 가져오기
    autoFillBtn.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const url = tabs[0].url;
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        
        if (match) {
          const owner = match[1];
          const repo = match[2];
          
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
        } else {
          errorMessage.textContent = 'GitHub 레포지토리 페이지가 아닙니다.';
          errorMessage.style.display = 'block';
          setTimeout(() => {
            errorMessage.style.display = 'none';
          }, 3000);
        }
      });
    });
  
    // 커밋 분석 요청 (Django 백엔드)
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
        
        // Django 백엔드 API 호출
        const backendUrl = await getBackendUrl();
        const overviewEndpoint = `${backendUrl}/overview/api/generate/`;
        
        const csrfToken = await fetchCsrfToken(backendUrl);
        
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
          credentials: 'include'  // 쿠키 포함
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '백엔드 서버 오류가 발생했습니다.');
        }
        
        const data = await response.json();
        
        // 마크다운 결과 표시 (marked.js 라이브러리 사용)
        const marked = window.marked || await loadMarkedLibrary();
        analysisResult.innerHTML = marked.parse(data.analysis);
        
        // 결과 표시
        loading.style.display = 'none';
        resultContainer.style.display = 'block';
        
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
  
    // marked.js 라이브러리 로드
    async function loadMarkedLibrary() {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
        script.onload = () => resolve(window.marked);
        document.head.appendChild(script);
      });
    }
  
    // 결과 복사 버튼
    copyBtn.addEventListener('click', function() {
      chrome.storage.local.get('lastAnalysis', function(data) {
        if (data.lastAnalysis && data.lastAnalysis.markdown) {
          navigator.clipboard.writeText(data.lastAnalysis.markdown)
            .then(() => {
              copyBtn.textContent = '복사됨!';
              setTimeout(() => {
                copyBtn.textContent = '결과 복사';
              }, 2000);
            })
            .catch(err => {
              errorMessage.textContent = `복사 실패: ${err}`;
              errorMessage.style.display = 'block';
            });
        }
      });
    });
  
    // 마크다운 다운로드 버튼
    downloadBtn.addEventListener('click', function() {
      chrome.storage.local.get('lastAnalysis', function(data) {
        if (data.lastAnalysis && data.lastAnalysis.markdown) {
          const blob = new Blob([data.lastAnalysis.markdown], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${data.lastAnalysis.repo}-overview.md`;
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    });
  
    // 저장 버튼
    saveBtn.addEventListener('click', function() {
      chrome.storage.local.get(['savedAnalyses', 'lastAnalysis'], function(data) {
        if (data.lastAnalysis) {
          const savedAnalyses = data.savedAnalyses || [];
          savedAnalyses.push({
            ...data.lastAnalysis,
            id: Date.now().toString()
          });
          
          chrome.storage.local.set({ savedAnalyses }, function() {
            saveBtn.textContent = '저장됨!';
            setTimeout(() => {
              saveBtn.textContent = '저장하기';
            }, 2000);
          });
        }
      });
    });
  
    // 저장된 데이터 로드
    chrome.storage.local.get('githubUsername', function(data) {
      if (data.githubUsername) {
        document.getElementById('username').value = data.githubUsername;
      }
    });
  });