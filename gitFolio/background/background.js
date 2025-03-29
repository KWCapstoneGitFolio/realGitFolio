chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'analyzeRepository') {
      analyzeRepository(request.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ error: error.message }));
      return true; // 비동기 응답 처리를 위한 true 반환
    }
  });
  
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
  
  async function getGitHubToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get('githubToken', function(data) {
        resolve(data.githubToken || '');
      });
    });
  }
  
  async function getAnthropicApiKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get('anthropicApiKey', function(data) {
        resolve(data.anthropicApiKey || '');
      });
    });
  }
  
  // GitHub GraphQL API로 커밋 히스토리 가져오기
  async function fetchDetailedCommitHistory(owner, repo, username, count = 20) {
    const token = await getGitHubToken();
    
    // GraphQL 쿼리 구성 (utils.py에서 가져온 것과 동일)
    const query = `
      query {
        repository(owner: "${owner}", name: "${repo}") {
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: ${count}) {
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
      throw new Error(`GitHub API 오류: ${errorText}`);
    }
    
    const data = await response.json();
    
    try {
      const edges = data.data.repository.defaultBranchRef.target.history.edges;
      return edges.map(edge => edge.node);
    } catch (error) {
      throw new Error(`API 응답 구조 오류: ${error.message}`);
    }
  }
  
  // 커밋 메시지 분석
  async function analyzeCommitMessages(commits) {
    const anthropicApiKey = await getAnthropicApiKey();
    if (!anthropicApiKey) {
      throw new Error("Anthropic API 키가 설정되지 않았습니다. 옵션 페이지에서 설정해주세요.");
    }
    
    // 커밋 메시지 목록 구성
    const commitMessages = commits.map(commit => 
      `${commit.messageHeadline} (${commit.committedDate})`
    ).join('\n');
    
    // Anthropic API 요청 프롬프트 구성
    const prompt = `아래의 GitHub 커밋 메시지들을 분석하여 반드시 아래와 같은 JSON 형식으로 응답해주세요.
    {
      "project_overview": "프로젝트 개요 및 핵심 특징에 대한 서술",
      "contributions": [
          { "area": "기여 영역", "description": "주요 기술 기여 내용" }
      ],
      "tech_stack": ["사용된 기술 스택 목록"],
      "code_highlights": ["주요 코드 변경 사항 등"]
    }
    
    커밋 메시지:
    ${commitMessages}`;
    
    // Anthropic API 호출
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        "model": "claude-3-7-sonnet-20250219",
        "system": "커밋 메시지를 분석하여 JSON 형태로 정보를 추출하는 도우미입니다.",
        "messages": [
          {"role": "user", "content": prompt}
        ],
        "max_tokens": 1000
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 오류: ${errorText}`);
    }
    
    const responseData = await response.json();
    
    // 응답에서 텍스트 추출
    let assistantMessage = null;
    if (responseData.content) {
      for (const item of responseData.content) {
        if (item.type === "text") {
          assistantMessage = item.text;
          break;
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
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        throw new Error("JSON 형식을 찾을 수 없습니다.");
      }
    } catch (error) {
      throw new Error(`JSON 파싱 실패: ${error.message}`);
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
        mdLines.push(`- **주요 기술 기여:** ${description}`);
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
      mdLines.push(techStack.join(", "));
    } else {
      mdLines.push("기술 스택 정보가 제공되지 않았습니다.");
    }
    mdLines.push("");
    
    // 4. 코드 기여 하이라이트
    mdLines.push("# 코드 기여 하이라이트");
    const codeHighlights = analysis.code_highlights;
    if (codeHighlights && Array.isArray(codeHighlights) && codeHighlights.length > 0) {
      for (const highlight of codeHighlights) {
        mdLines.push(`- ${highlight}`);
      }
    } else {
      mdLines.push("코드 기여 하이라이트 정보가 제공되지 않았습니다.");
    }
    
    return mdLines.join("\n");
  }