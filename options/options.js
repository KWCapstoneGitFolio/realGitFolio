document.addEventListener('DOMContentLoaded', function() {
    const backendUrlInput = document.getElementById('backend-url');
    const githubUsernameInput = document.getElementById('github-username');
    const saveBtn = document.getElementById('save-btn');
    const statusDiv = document.getElementById('status');
    
    // 저장된 설정 로드
    chrome.storage.local.get(['backendUrl', 'githubUsername'], function(data) {
      if (data.backendUrl) {
        backendUrlInput.value = data.backendUrl;
      } else {
        backendUrlInput.value = 'http://localhost:8000';  // 기본값
      }
      
      if (data.githubUsername) {
        githubUsernameInput.value = data.githubUsername;
      }
    });
    
    // 설정 저장
    saveBtn.addEventListener('click', function() {
      const backendUrl = backendUrlInput.value.trim();
      const githubUsername = githubUsernameInput.value.trim();
      
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
      
      chrome.storage.local.set({
        backendUrl,
        githubUsername
      }, function() {
        showStatus('설정이 저장되었습니다!', 'success');
      });
    });
    
    function showStatus(message, type) {
      statusDiv.textContent = message;
      statusDiv.className = `status ${type}`;
      statusDiv.style.display = 'block';
      
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    }
  });