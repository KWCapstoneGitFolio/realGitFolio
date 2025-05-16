document.addEventListener('DOMContentLoaded', function() {
  // 요소 참조
  const backendUrlInput = document.getElementById('backend-url');
  const githubUsernameInput = document.getElementById('github-username');
  const githubTokenInput = document.getElementById('github-token');
  const tokenScopeSelect = document.getElementById('token-scope');
  const autoUpdateCheckbox = document.getElementById('auto-update');
  const autoOpenGithubCheckbox = document.getElementById('auto-open-github'); // 새로 추가한 요소
  const uiModeSelect = document.getElementById('ui-mode');
  const themeSelect = document.getElementById('theme');
  const fontSizeSelect = document.getElementById('font-size');
  const saveBtn = document.getElementById('save-btn');
  const resetBtn = document.getElementById('reset-btn');
  const statusDiv = document.getElementById('status');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // 기본 설정값 - 'popup'에서 'sidebar'로 변경
  const defaultSettings = {
    backendUrl: 'http://localhost:8000',
    githubUsername: '',
    autoUpdate: true,
    autoOpenOnGitHub: true, // 새로 추가한 설정
    uiMode: 'sidebar', // 'popup'에서 'sidebar'로 변경
    theme: 'auto',
    fontSize: 'medium',
    tokenScope: 'local'
  };
  
  // 탭 전환 기능
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabId = this.getAttribute('data-tab');
      
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));
      
      this.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // 설정 로드
  function loadSettings() {
    // 로컬 스토리지에서 먼저 로드
    chrome.storage.local.get(
      ['backendUrl', 'githubUsername', 'autoUpdate', 'autoOpenOnGitHub', 'uiMode', 'theme', 'fontSize', 'tokenScope'],
      function(localData) {
        // 동기화 스토리지에서 로드 (있으면 병합)
        chrome.storage.sync.get(
          ['backendUrl', 'githubUsername', 'autoUpdate', 'autoOpenOnGitHub', 'uiMode', 'theme', 'fontSize'],
          function(syncData) {
            // 기본값으로 시작하고 저장된 설정으로 덮어쓰기
            const settings = {...defaultSettings, ...syncData, ...localData};
            
            // GitHub 토큰은 따로 처리 (선택된 스토리지 방식에 따라)
            const tokenStorage = settings.tokenScope === 'sync' ? chrome.storage.sync : chrome.storage.local;
            tokenStorage.get(['githubToken'], function(tokenData) {
              // UI 업데이트
              backendUrlInput.value = settings.backendUrl;
              githubUsernameInput.value = settings.githubUsername || '';
              githubTokenInput.value = tokenData.githubToken || '';
              tokenScopeSelect.value = settings.tokenScope;
              autoUpdateCheckbox.checked = settings.autoUpdate;
              
              // 새로 추가한 옵션에 대한 처리
              if (autoOpenGithubCheckbox) {
                autoOpenGithubCheckbox.checked = settings.autoOpenOnGitHub !== false; // 기본값은 true
              }
              
              uiModeSelect.value = settings.uiMode;
              themeSelect.value = settings.theme;
              fontSizeSelect.value = settings.fontSize;
            });
          }
        );
      }
    );
  }
  
  // 설정 저장
  saveBtn.addEventListener('click', function() {
    // 입력값 검증
    const backendUrl = backendUrlInput.value.trim();
    const githubUsername = githubUsernameInput.value.trim();
    const githubToken = githubTokenInput.value.trim();
    const tokenScope = tokenScopeSelect.value;
    const autoUpdate = autoUpdateCheckbox.checked;
    
    // 새로 추가한 옵션에 대한 값 가져오기
    const autoOpenOnGitHub = autoOpenGithubCheckbox ? autoOpenGithubCheckbox.checked : true;
    
    const uiMode = uiModeSelect.value;
    const theme = themeSelect.value;
    const fontSize = fontSizeSelect.value;
    
    if (!backendUrl) {
      showStatus('백엔드 서버 URL을 입력해주세요.', 'error');
      return;
    }
    
    // URL 유효성 검사
    try {
      new URL(backendUrl);
    } catch (e) {
      showStatus('유효한 URL을 입력해주세요.', 'error');
      return;
    }
    
    // 공통 설정 - 로컬과 동기화 모두에 저장할 설정
    const commonSettings = {
      backendUrl,
      githubUsername,
      autoUpdate,
      autoOpenOnGitHub, // 새로 추가한 설정
      uiMode,
      theme,
      fontSize,
      tokenScope
    };
    
    // 로컬 저장소에 저장
    chrome.storage.local.set(commonSettings, function() {
      // 선택적으로 동기화 저장소에도 저장 (토큰 제외)
      chrome.storage.sync.set({
        backendUrl,
        githubUsername,
        autoUpdate,
        autoOpenOnGitHub, // 새로 추가한 설정
        uiMode,
        theme,
        fontSize
      }, function() {
        // GitHub 토큰 저장 (선택된 스토리지 방식에 따라)
        if (githubToken) {
          const tokenStorage = tokenScope === 'sync' ? chrome.storage.sync : chrome.storage.local;
          tokenStorage.set({ githubToken }, function() {
            if (chrome.runtime.lastError) {
              showStatus('토큰 저장 중 오류가 발생했습니다: ' + chrome.runtime.lastError.message, 'error');
            } else {
              showStatus('모든 설정이 저장되었습니다!', 'success');
              
              // 변경된 설정으로 백그라운드 스크립트에 알림
              chrome.runtime.sendMessage({ action: 'settingsUpdated', settings: commonSettings });
            }
          });
        } else {
          showStatus('설정이 저장되었습니다!', 'success');
          
          // 변경된 설정으로 백그라운드 스크립트에 알림
          chrome.runtime.sendMessage({ action: 'settingsUpdated', settings: commonSettings });
        }
      });
    });
  });
  
  // 설정 초기화
  resetBtn.addEventListener('click', function() {
    if (confirm('모든 설정을 기본값으로 초기화하시겠습니까?')) {
      // 기본값으로 UI 업데이트
      backendUrlInput.value = defaultSettings.backendUrl;
      githubUsernameInput.value = defaultSettings.githubUsername;
      githubTokenInput.value = '';
      tokenScopeSelect.value = defaultSettings.tokenScope;
      autoUpdateCheckbox.checked = defaultSettings.autoUpdate;
      
      // 새로 추가한 옵션에 대한 UI 업데이트
      if (autoOpenGithubCheckbox) {
        autoOpenGithubCheckbox.checked = defaultSettings.autoOpenOnGitHub;
      }
      
      uiModeSelect.value = defaultSettings.uiMode;
      themeSelect.value = defaultSettings.theme;
      fontSizeSelect.value = defaultSettings.fontSize;
      
      // 스토리지에서 모든 설정 삭제
      chrome.storage.local.clear(function() {
        chrome.storage.sync.clear(function() {
          // 기본값 저장
          chrome.storage.local.set(defaultSettings, function() {
            showStatus('모든 설정이 초기화되었습니다.', 'info');
            
            // 백그라운드 스크립트에 설정 초기화 알림
            chrome.runtime.sendMessage({ 
              action: 'settingsUpdated', 
              settings: defaultSettings 
            });
          });
        });
      });
    }
  });
  
  // 토큰 범위 변경 시 경고
  tokenScopeSelect.addEventListener('change', function() {
    if (this.value === 'sync' && githubTokenInput.value) {
      showStatus('주의: 토큰을 동기화하면 로그인한 모든 기기에서 토큰이 공유됩니다.', 'info');
    }
  });
  
  // UI 모드 변경 시 설명 업데이트
  uiModeSelect.addEventListener('change', function() {
    const mode = this.value;
    
    if (mode === 'sidebar') {
      showStatus('사이드바 모드로 변경됩니다. 확장 프로그램 아이콘 클릭 시 사이드패널이 열립니다.', 'info');
    } else if (mode === 'popup') {
      showStatus('팝업 모드로 변경됩니다. 확장 프로그램 아이콘 클릭 시 팝업이 열립니다.', 'info');
    } else if (mode === 'both') {
      showStatus('듀얼 모드로 변경됩니다. 아이콘 클릭 시 팝업이 열리고, 사이드패널도 함께 열립니다.', 'info');
    }
  });
  
  // 상태 메시지 표시 함수
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    // 3초 후 메시지 숨기기
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
  
  // 페이지 로드 시 설정 로드
  loadSettings();
});