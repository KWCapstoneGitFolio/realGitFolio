// 사이드 패널 관리를 위한 백그라운드 스크립트
chrome.runtime.onInstalled.addListener(function() {
  console.log("확장 프로그램이 설치되었거나 업데이트되었습니다.");
  
  // 기본 설정 초기화
  chrome.storage.local.get(['uiMode'], function(data) {
    if (!data.uiMode) {
      console.log("UI 모드 기본값 설정: popup");
      chrome.storage.local.set({ uiMode: 'popup' });
    } else {
      console.log("현재 UI 모드:", data.uiMode);
    }
  });
  
  // 사이드 패널 설정
  if (chrome.sidePanel) {
    console.log("사이드 패널 API 사용 가능, 기본 동작 설정");
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } else {
    console.warn("사이드 패널 API를 사용할 수 없습니다.");
  }
});

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log("메시지 수신:", message);
  
  // 설정 업데이트 처리
  if (message.action === 'settingsUpdated') {
    console.log("설정 업데이트:", message.settings);
    handleSettingsUpdate(message.settings);
    sendResponse({ success: true });
  }
  
  // 팝업에서 사이드패널 열기 요청
  else if (message.action === 'openSidePanel') {
    console.log("사이드 패널 열기 요청, 윈도우 ID:", message.windowId);
    
    if (chrome.sidePanel) {
      try {
        chrome.sidePanel.open({ windowId: message.windowId })
          .then(() => {
            console.log("사이드 패널이 성공적으로 열렸습니다.");
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error("사이드 패널 열기 실패:", error);
            sendResponse({ success: false, error: error.toString() });
          });
      } catch (error) {
        console.error("사이드 패널 열기 예외:", error);
        sendResponse({ success: false, error: error.toString() });
      }
    } else {
      console.error("사이드 패널 API를 사용할 수 없습니다.");
      sendResponse({ success: false, error: 'Side panel API not available' });
    }
    return true; // 비동기 응답을 위해 true 반환
  }
  
  // 레포지토리 분석 요청
  else if (message.action === 'analyzeRepository') {
    console.log("레포지토리 분석 요청:", message.data);
    
    analyzeRepository(message.data)
      .then(result => {
        console.log("분석 완료, 결과 반환");
        sendResponse(result);
      })
      .catch(error => {
        console.error("분석 오류:", error);
        sendResponse({ error: error.message });
      });
    return true; // 비동기 응답 처리를 위한 true 반환
  }
  
  // 이전 분석 결과 공유 (팝업 <-> 사이드패널)
  else if (message.action === 'shareAnalysisResult') {
    console.log("분석 결과 공유");
    // 저장소에 임시 저장
    chrome.storage.local.set({ 
      'lastAnalysisResult': message.data 
    }, function() {
      console.log("분석 결과가 저장되었습니다.");
      // 다른 UI 컴포넌트에 알림
      chrome.runtime.sendMessage({
        action: 'analysisResultUpdated',
        data: message.data
      });
      sendResponse({ success: true });
    });
    return true;
  }
  
  // 마지막 분석 결과 요청
  else if (message.action === 'getLastAnalysisResult') {
    chrome.storage.local.get(['lastAnalysisResult'], function(data) {
      sendResponse({ 
        success: true, 
        data: data.lastAnalysisResult || null 
      });
    });
    return true;
  }
  
  return true; // 모든 메시지에 대해 비동기 응답을 위해 true 반환
});

// 명령어 처리 (단축키)
chrome.commands.onCommand.addListener(function(command) {
  console.log("단축키 명령 수신:", command);
  
  if (command === 'toggle_side_panel') {
    if (chrome.sidePanel) {
      console.log("사이드 패널 토글 시도");
      chrome.sidePanel.open()
        .then(() => console.log("사이드 패널 열기 성공"))
        .catch(error => console.error("사이드 패널 열기 실패:", error));
    } else {
      console.error("사이드 패널 API를 사용할 수 없습니다.");
    }
  }
});

// 확장 프로그램 아이콘 클릭 처리
chrome.action.onClicked.addListener(function(tab) {
  console.log("확장 프로그램 아이콘 클릭됨, 탭:", tab.id);
  
  // 설정에 따라 UI 모드 결정
  chrome.storage.local.get(['uiMode'], function(data) {
    console.log("현재 UI 모드:", data.uiMode);
    
    if (data.uiMode === 'sidebar') {
      // 사이드바 모드면 사이드 패널 열기
      if (chrome.sidePanel) {
        console.log("사이드 패널 열기 시도");
        chrome.sidePanel.open({ windowId: tab.windowId })
          .then(() => console.log("사이드 패널 열기 성공"))
          .catch(error => console.error("사이드 패널 열기 실패:", error));
      } else {
        console.error("사이드 패널 API를 사용할 수 없습니다.");
      }
    } else if (data.uiMode === 'both') {
      // 둘 다 사용 모드인 경우 팝업과 사이드 패널 모두 열기
      if (chrome.sidePanel) {
        console.log("사이드 패널 열기 시도 (both 모드)");
        chrome.sidePanel.open({ windowId: tab.windowId })
          .then(() => console.log("사이드 패널 열기 성공"))
          .catch(error => console.error("사이드 패널 열기 실패:", error));
      }
      // popup은 기본적으로 열림
    }
    
    // 팝업 모드가 기본값이거나 'both'인 경우에는 이 핸들러가 호출되지 않음
    // popup 속성이 manifest.json에 설정되어 있으면 자동으로 팝업이 열림
  });
});

// 설정 업데이트 처리
function handleSettingsUpdate(settings) {
  console.log("UI 모드 설정 변경:", settings.uiMode);
  
  // UI 모드에 따라 action 설정 변경
  if (settings.uiMode === 'sidebar') {
    // 사이드바 모드: 아이콘 클릭 시 사이드 패널 열기
    console.log("사이드바 모드로 설정");
    chrome.action.setPopup({ popup: '' }); // 팝업 비활성화
    
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } else if (settings.uiMode === 'popup') {
    // 팝업 모드: 아이콘 클릭 시 팝업 열기
    console.log("팝업 모드로 설정");
    chrome.action.setPopup({ popup: 'popup/popup.html' });
    
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
  } else if (settings.uiMode === 'both') {
    // 둘 다 사용: 아이콘 클릭 시 팝업 열고, 별도로 사이드 패널도 열기
    console.log("팝업+사이드바 모드로 설정");
    chrome.action.setPopup({ popup: 'popup/popup.html' });
    
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
  }
}

// 백엔드 URL 가져오기
async function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['backendUrl'], function(data) {
      resolve(data.backendUrl || 'http://localhost:8000');
    });
  });
}

// GitHub 토큰 가져오기
async function getGitHubToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['githubToken', 'tokenScope'], function(data) {
      if (data.githubToken) {
        resolve(data.githubToken);
      } else if (data.tokenScope === 'sync') {
        // 동기화 스토리지에서 토큰 가져오기 시도
        chrome.storage.sync.get(['githubToken'], function(syncData) {
          resolve(syncData.githubToken || '');
        });
      } else {
        resolve('');
      }
    });
  });
}

// 레포지토리 분석 함수
async function analyzeRepository(data) {
  try {
    console.log("레포지토리 분석 시작:", data);
    
    // GitHub 토큰 가져오기 (백엔드에 전달하기 위해)
    const token = await getGitHubToken();
    const backendUrl = await getBackendUrl();
    
    console.log("백엔드 서버로 분석 요청:", backendUrl);
    
    // 백엔드 API 호출
    const response = await fetch(`${backendUrl}/overview/api/generate/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        owner: data.owner,
        repo: data.repo,
        username: data.username,
        count: data.count,
        github_token: token || undefined  // 토큰이 있을 경우에만 전송
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`백엔드 API 오류: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log("백엔드 응답 수신");
    
    // 응답 처리
    return { 
      success: true, 
      analysisMarkdown: result.analysis || '',
      analysis: result
    };
  } catch (error) {
    console.error('Repository 분석 에러:', error);
    throw error;
  }
}

// 초기화 함수 - 익스텐션이 로드될 때 실행
function initialize() {
  console.log("GitFolio 확장 프로그램 초기화");
  
  // 설정에 따라 UI 모드 적용
  chrome.storage.local.get(['uiMode'], function(data) {
    if (data.uiMode) {
      console.log("저장된 UI 모드 적용:", data.uiMode);
      handleSettingsUpdate({ uiMode: data.uiMode });
    } else {
      console.log("기본 UI 모드 적용: popup");
      handleSettingsUpdate({ uiMode: 'popup' });
    }
  });
}

// 초기화 실행
initialize();