// 사이드 패널 관리를 위한 백그라운드 스크립트
chrome.runtime.onInstalled.addListener(function() {
  // 기본 설정 초기화
  chrome.storage.local.get(['uiMode'], function(data) {
    if (!data.uiMode) {
      chrome.storage.local.set({ uiMode: 'popup' });
    }
  });
  
  // 사이드 패널 설정
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
});

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // 설정 업데이트 처리
  if (message.action === 'settingsUpdated') {
    handleSettingsUpdate(message.settings);
  }
  
  // 팝업에서 사이드패널 열기 요청
  if (message.action === 'openSidePanel') {
    if (chrome.sidePanel) {
      chrome.sidePanel.open({ windowId: message.windowId });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Side panel API not available' });
    }
  }
  
  // 레포지토리 분석 요청
  if (message.action === 'analyzeRepository') {
    analyzeRepository(message.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // 비동기 응답 처리를 위한 true 반환
  }
  
  return true; // 비동기 응답을 위해 항상 true 반환
});

// 명령어 처리 (단축키)
chrome.commands.onCommand.addListener(function(command) {
  if (command === 'toggle_side_panel') {
    if (chrome.sidePanel) {
      // 현재 상태를 확인할 방법이 없으므로 항상 토글 시도
      chrome.sidePanel.open();
    }
  }
});

// 확장 프로그램 아이콘 클릭 처리
chrome.action.onClicked.addListener(function(tab) {
  // 설정에 따라 UI 모드 결정
  chrome.storage.local.get(['uiMode'], function(data) {
    if (data.uiMode === 'sidebar' || data.uiMode === 'both') {
      // 사이드바 모드면 사이드 패널 열기
      if (chrome.sidePanel) {
        chrome.sidePanel.open({ windowId: tab.windowId });
      }
    }
    
    // 팝업 모드가 기본값이거나 'both'인 경우에는 이 핸들러가 호출되지 않음
    // popup 속성이 manifest.json에 설정되어 있으면 자동으로 팝업이 열림
  });
});

// 설정 업데이트 처리
function handleSettingsUpdate(settings) {
  // UI 모드에 따라 action 설정 변경
  if (settings.uiMode === 'sidebar') {
    // 사이드바 모드: 아이콘 클릭 시 사이드 패널 열기
    chrome.action.setPopup({ popup: '' }); // 팝업 비활성화
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } else if (settings.uiMode === 'popup') {
    // 팝업 모드: 아이콘 클릭 시 팝업 열기
    chrome.action.setPopup({ popup: 'popup/popup.html' });
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
  } else if (settings.uiMode === 'both') {
    // 둘 다 사용: 아이콘 클릭 시 팝업 열고, 별도로 사이드 패널도 열기
    chrome.action.setPopup({ popup: 'popup/popup.html' });
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
  }
}

// 레포지토리 분석 함수
async function analyzeRepository(data) {
  try {
    // GitHub 토큰 가져오기
    const token = await getGitHubToken();
    if (!token) {
      throw new Error("GitHub 토큰이 설정되지 않았습니다. 옵션 페이지에서 설정해주세요.");
    }
    
    // 1. GitHub API에서 커밋 히스토리 가져오기
    const commits = await fetchDetailedCommitHistory(
      data.owner, 
      data.repo, 
      data.username, 
      data.count
    );
    
    // 2. Anthropic API로 커밋 분석
    const analysis = await analyzeCommitMessages(commits);
    
    // 3. 마크다운으로 결과 포맷팅
    const analysisMarkdown = formatAnalysisMd(analysis);
    
    return { 
      success: true, 
      analysisMarkdown,
      analysis
    };
  } catch (error) {
    console.error('Repository 분석 에러:', error);
    throw error;
  }
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

// Anthropic API 키 가져오기
async function getAnthropicApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['anthropicApiKey'], function(data) {
      resolve(data.anthropicApiKey || '');
    });
  });
}

// 백엔드 URL 가져오기
async function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['backendUrl'], function(data) {
      resolve(data.backendUrl || 'http://localhost:8000');
    });
  });
}

// GitHub GraphQL API로 커밋 히스토리 가져오기
async function fetchDetailedCommitHistory(owner, repo, username, count = 20) {
  const token = await getGitHubToken();
  
  // GraphQL 쿼리 구성
  const query = `
    query {
      repository(owner: "${owner}", name: "${repo}") {
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: ${count}, author: ${username ? `{emails: ["${username}"]}` : ''}) {
                edges {
                  node {
                    messageHeadline
                    message
                    committedDate
                    changedFiles
                    additions
                    deletions
                    parents(first: 1) {
                      totalCount
                    }
                    author {
                      name
                      email
                      user {
                        login
                        avatarUrl
                      }
                    }
                    associatedPullRequests(first: 1) {
                      nodes {
                        title
                        number
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  
  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API 오류: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // 에러 처리
    if (data.errors && data.errors.length > 0) {
      throw new Error(`GitHub GraphQL 에러: ${data.errors[0].message}`);
    }
    
    // 응답 파싱
    try {
      const edges = data.data.repository.defaultBranchRef.target.history.edges;
      return edges.map(edge => edge.node);
    } catch (error) {
      throw new Error(`API 응답 구조 오류: ${error.message}`);
    }
  } catch (error) {
    console.error('GitHub API 호출 오류:', error);
    throw error;
  }
}

// 커밋 메시지 분석
async function analyzeCommitMessages(commits) {
  // 백엔드 API 사용 설정 확인
  const useBackend = await checkUseBackendApi();
  
  if (useBackend) {
    return await analyzeWithBackend(commits);
  } else {
    return await analyzeWithAnthropicDirect(commits);
  }
}

// 백엔드 API 사용 여부 확인
async function checkUseBackendApi() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['useBackendApi'], function(data) {
      // 기본값은 true (백엔드 API 사용)
      resolve(data.useBackendApi !== false);
    });
  });
}

// 백엔드를 통한 분석
async function analyzeWithBackend(commits) {
  const backendUrl = await getBackendUrl();
  
  try {
    const response = await fetch(`${backendUrl}/api/analyze-commits/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ commits })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`백엔드 API 오류: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('백엔드 API 호출 오류:', error);
    throw error;
  }
}

// Anthropic API 직접 호출을 통한 분석
async function analyzeWithAnthropicDirect(commits) {
  const anthropicApiKey = await getAnthropicApiKey();
  if (!anthropicApiKey) {
    throw new Error("Anthropic API 키가 설정되지 않았습니다. 옵션 페이지에서 설정해주세요.");
  }
  
  // 커밋 메시지 목록 구성
  const commitMessagesArray = commits.map(commit => {
    const date = new Date(commit.committedDate).toISOString().split('T')[0];
    return {
      message: commit.message,
      date: date,
      files_changed: commit.changedFiles,
      additions: commit.additions,
      deletions: commit.deletions
    };
  });
  
  // JSON 형태로 변환
  const commitsJson = JSON.stringify(commitMessagesArray, null, 2);
  
  // Anthropic API 요청 프롬프트 구성
  const prompt = `아래의 GitHub 커밋 데이터를 분석하여 반드시 아래와 같은 JSON 형식으로 응답해주세요.
  {
    "project_overview": "프로젝트 개요 및 핵심 특징에 대한 서술",
    "contributions": [
        { "area": "기여 영역", "description": "주요 기술 기여 내용" }
    ],
    "tech_stack": ["사용된 기술 스택 목록"],
    "code_highlights": ["주요 코드 변경 사항 등"]
  }
  
  커밋 데이터:
  ${commitsJson}`;
  
  try {
    // Anthropic API 호출
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        "model": "claude-3-7-sonnet-20250219", //3.5랑 3.7이랑 가격 같음, 혹시 너무 비싸면 아래 코드로 고치세요 
        //"model": "claude-3-5-haiku-20241022", //테스트용이여서 클로드 3.5 하이쿠 사용중(소넷 가격 3/15달러 vs 3.5 하이쿠 0.8/4달러). 절대로 변경하지 말것 
        "system": "커밋 메시지를 분석하여 JSON 형태로 정보를 추출하는 도우미입니다.",
        "messages": [
          {"role": "user", "content": prompt}
        ],
        "max_tokens": 1500
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 오류: ${response.status} - ${errorText}`);
    }
    
    const responseData = await response.json();
    
    // 응답에서 텍스트 추출
    let assistantMessage = "";
    if (responseData.content && Array.isArray(responseData.content)) {
      for (const item of responseData.content) {
        if (item.type === "text") {
          assistantMessage += item.text;
        }
      }
    }
    
    if (!assistantMessage) {
      throw new Error("API 응답에서 텍스트를 찾을 수 없습니다.");
    }
    
    // JSON 추출
    const jsonMatch = assistantMessage.match(/```json\s*([\s\S]+?)\s*```/) || 
                      assistantMessage.match(/\{[\s\S]*\}/);
    
    try {
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(jsonStr);
      } else {
        throw new Error("JSON 형식을 찾을 수 없습니다.");
      }
    } catch (error) {
      throw new Error(`JSON 파싱 실패: ${error.message} - 원본 응답: ${assistantMessage.substring(0, 100)}...`);
    }
  } catch (error) {
    console.error('Anthropic API 호출 오류:', error);
    throw error;
  }
}

// 분석 결과를 마크다운으로 포맷팅
function formatAnalysisMd(analysis) {
  let mdLines = [];
  
  // 1. 프로젝트 개요 및 핵심 특징
  mdLines.push("# 프로젝트 개요 및 핵심 특징");
  const overview = analysis.project_overview;
  if (overview) {
    mdLines.push(overview);
  } else {
    mdLines.push("프로젝트 개요 정보가 제공되지 않았습니다.");
  }
  mdLines.push("");
  
  // 2. 기여 내역
  mdLines.push("# 기여 내역");
  const contributions = analysis.contributions;
  if (contributions && Array.isArray(contributions) && contributions.length > 0) {
    for (const contrib of contributions) {
      const area = contrib.area || "정보 없음";
      const description = contrib.description || "정보 없음";
      mdLines.push(`## ${area}`);
      mdLines.push(`${description}`);
      mdLines.push("");
    }
  } else {
    mdLines.push("기여 내역 정보가 제공되지 않았습니다.");
  }
  mdLines.push("");
  
  // 3. 기술 스택
  mdLines.push("# 기술 스택");
  const techStack = analysis.tech_stack;
  if (techStack && Array.isArray(techStack) && techStack.length > 0) {
    mdLines.push("");
    for (const tech of techStack) {
      mdLines.push(`- ${tech}`);
    }
  } else {
    mdLines.push("기술 스택 정보가 제공되지 않았습니다.");
  }
  mdLines.push("");
  
  // 4. 코드 기여 하이라이트
  mdLines.push("# 코드 기여 하이라이트");
  const codeHighlights = analysis.code_highlights;
  if (codeHighlights && Array.isArray(codeHighlights) && codeHighlights.length > 0) {
    mdLines.push("");
    for (const highlight of codeHighlights) {
      mdLines.push(`- ${highlight}`);
    }
  } else {
    mdLines.push("코드 기여 하이라이트 정보가 제공되지 않았습니다.");
  }
  
  return mdLines.join("\n");
}

// 초기화 함수 - 익스텐션이 로드될 때 실행
function initialize() {
  // 설정에 따라 UI 모드 적용
  chrome.storage.local.get(['uiMode'], function(data) {
    if (data.uiMode) {
      handleSettingsUpdate({ uiMode: data.uiMode });
    }
  });
}

// 초기화 실행
initialize();