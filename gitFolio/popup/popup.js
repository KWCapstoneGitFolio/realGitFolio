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
  
    // 커밋 분석 요청 (Django 백엔드)
    form.addEventListener('submit', async function(e) {
      console.log("폼 제출됨");
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
        form.style.display = 'none';
        loading.style.display = 'flex';
        resultContainer.style.display = 'none';
        
        // 타임아웃 설정
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error("요청 타임아웃");
          controller.abort();
        }, 60000); // 60초 타임아웃
        
        // Django 백엔드 API 호출
        console.log("백엔드 URL 가져오는 중...");
        const backendUrl = await getBackendUrl();
        console.log("백엔드 URL:", backendUrl);
        
        console.log("CSRF 토큰 요청 중...");
        const csrfToken = await fetchCsrfToken(backendUrl);
        console.log("CSRF 토큰 받음:", csrfToken);
        
        const overviewEndpoint = `${backendUrl}/overview/api/generate/`;
        console.log("API 엔드포인트:", overviewEndpoint);
        
        console.log("API 요청 보내는 중...");
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
          credentials: 'include',  // 쿠키 포함
          signal: controller.signal // 타임아웃을 위한 AbortController
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
        
        // 마크다운 결과 표시 (marked.js 라이브러리 사용)
        console.log("마크다운 파서 로드 중...");
        const marked = window.marked || await loadMarkedLibrary();
        console.log("마크다운 파싱 중...");
        analysisResult.innerHTML = marked.parse(data.analysis);
        
        // 결과 표시
        console.log("결과 표시 중...");
        loading.style.display = 'none';
        resultContainer.style.display = 'block';
        
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
        
        loading.style.display = 'none';
        form.style.display = 'block';
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
  
    // 저장된 데이터 로드
    chrome.storage.local.get('githubUsername', function(data) {
      if (data.githubUsername) {
        console.log("저장된 GitHub 사용자명 로드:", data.githubUsername);
        document.getElementById('username').value = data.githubUsername;
      }
    });
    
    console.log("팝업 초기화 완료");
  });