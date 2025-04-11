document.addEventListener('DOMContentLoaded', function() {
  console.log("사이드 패널 로드됨");
  
  // 요소 참조
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
  
  // 마지막 분석 결과 가져오기
  loadLastAnalysisResult();
  
  // 폼 제출 이벤트 리스너
  if (repoForm) {
    repoForm.addEventListener('submit', function(e) {
      e.preventDefault();
      analyzeRepository();
    });
  }
  
  // 자동 채우기 버튼 이벤트 리스너
  if (autoFillBtn) {
    autoFillBtn.addEventListener('click', function() {
      autoFillFromCurrentPage();
    });
  }
  
  // 복사 버튼 이벤트 리스너
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      copyAnalysisToClipboard();
    });
  }
  
  // 다운로드 버튼 이벤트 리스너
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      downloadAnalysis();
    });
  }
  
  // 저장 버튼 이벤트 리스너
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      saveAnalysis();
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
  
  // 분석 요청 함수
  function analyzeRepository() {
    // 로딩 표시
    loadingIndicator.style.display = 'flex';
    resultContainer.style.display = 'none';
    errorMessage.style.display = 'none';
    
    // 폼 데이터 수집
    const owner = document.getElementById('owner').value;
    const repo = document.getElementById('repo').value;
    const username = document.getElementById('username').value;
    const count = document.getElementById('count').value;
    
    console.log("분석 요청 데이터:", { owner, repo, username, count });
    
    // 백그라운드 스크립트에 요청
    chrome.runtime.sendMessage({
      action: 'analyzeRepository',
      data: { owner, repo, username, count }
    }, function(response) {
      // 로딩 숨기기
      loadingIndicator.style.display = 'none';
      
      if (response.error) {
        // 오류 표시
        errorMessage.textContent = response.error;
        errorMessage.style.display = 'block';
        console.error("분석 오류:", response.error);
      } else {
        // 분석 결과 표시
        displayAnalysis(response.analysisMarkdown);
        
        // 결과 공유 (팝업이나 다른 컴포넌트에서 접근할 수 있도록)
        chrome.runtime.sendMessage({
          action: 'shareAnalysisResult',
          data: response
        });
      }
    });
  }
  
  // 분석 결과 표시 함수
  function displayAnalysis(markdown) {
    analysisResult.innerHTML = marked.parse(markdown);
    resultContainer.style.display = 'block';
    console.log("분석 결과 표시됨");
  }
  
  // 현재 페이지에서 자동 채우기
  function autoFillFromCurrentPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0]) {
        const url = tabs[0].url;
        const githubRepoPattern = /github\.com\/([^\/]+)\/([^\/]+)/;
        const match = url.match(githubRepoPattern);
        
        if (match && match.length >= 3) {
          document.getElementById('owner').value = match[1];
          document.getElementById('repo').value = match[2];
          
          // GitHub 사용자명은 로컬 스토리지나 옵션에서 가져오기
          chrome.storage.local.get(['defaultUsername'], function(data) {
            if (data.defaultUsername) {
              document.getElementById('username').value = data.defaultUsername;
            }
          });
          
          console.log("현재 페이지에서 자동 채움:", match[1], match[2]);
        } else {
          errorMessage.textContent = "현재 페이지가 GitHub 저장소가 아닙니다.";
          errorMessage.style.display = 'block';
          setTimeout(() => {
            errorMessage.style.display = 'none';
          }, 3000);
        }
      }
    });
  }
  
  // 분석 결과 복사
  function copyAnalysisToClipboard() {
    const analysisText = analysisResult.innerText;
    navigator.clipboard.writeText(analysisText)
      .then(() => {
        showToast("분석 결과가 클립보드에 복사되었습니다.");
      })
      .catch(err => {
        console.error("클립보드 복사 실패:", err);
        showToast("클립보드 복사에 실패했습니다.", true);
      });
  }
  
  // Markdown 다운로드
  function downloadAnalysis() {
    chrome.storage.local.get(['lastAnalysisResult'], function(data) {
      if (data.lastAnalysisResult && data.lastAnalysisResult.analysisMarkdown) {
        const markdown = data.lastAnalysisResult.analysisMarkdown;
        const owner = document.getElementById('owner').value;
        const repo = document.getElementById('repo').value;
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${owner}-${repo}-analysis.md`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("분석 결과가 다운로드되었습니다.");
      } else {
        showToast("다운로드할 분석 결과가 없습니다.", true);
      }
    });
  }
  
  // 분석 결과 저장
  function saveAnalysis() {
    chrome.storage.local.get(['lastAnalysisResult', 'savedAnalyses'], function(data) {
      if (data.lastAnalysisResult) {
        const savedAnalyses = data.savedAnalyses || [];
        const owner = document.getElementById('owner').value;
        const repo = document.getElementById('repo').value;
        
        // 저장할 분석 데이터 구성
        const analysisToSave = {
          id: Date.now(),
          date: new Date().toISOString(),
          owner: owner,
          repo: repo,
          markdown: data.lastAnalysisResult.analysisMarkdown
        };
        
        // 최대 10개까지만 저장
        if (savedAnalyses.length >= 10) {
          savedAnalyses.shift(); // 가장 오래된 항목 제거
        }
        
        savedAnalyses.push(analysisToSave);
        
        // 저장
        chrome.storage.local.set({ savedAnalyses: savedAnalyses }, function() {
          showToast("분석 결과가 저장되었습니다.");
        });
      } else {
        showToast("저장할 분석 결과가 없습니다.", true);
      }
    });
  }
  
  // 마지막 분석 결과 로드
  function loadLastAnalysisResult() {
    chrome.runtime.sendMessage({
      action: 'getLastAnalysisResult'
    }, function(response) {
      if (response.success && response.data) {
        displayAnalysis(response.data.analysisMarkdown);
      }
    });
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
});