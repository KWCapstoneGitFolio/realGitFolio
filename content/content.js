// GitHub 페이지에 GitFolio 버튼 추가
(function() {
    // 레포지토리 페이지인지 확인
    const repoNavItems = document.querySelector('ul.UnderlineNav-body');
    if (!repoNavItems) return;
    
    // 현재 레포지토리 정보 추출
    const repoPath = window.location.pathname.split('/');
    if (repoPath.length < 3) return;
    
    // GitFolio 버튼 생성
    const gitFolioLi = document.createElement('li');
    gitFolioLi.className = 'UnderlineNav-item mr-0 mr-md-1';
    
    const gitFolioButton = document.createElement('a');
    gitFolioButton.className = 'UnderlineNav-item btn-link';
    gitFolioButton.style.padding = '8px 16px';
    gitFolioButton.textContent = '🚀 GitFolio 분석';
    gitFolioButton.href = '#';
    
    gitFolioLi.appendChild(gitFolioButton);
    repoNavItems.appendChild(gitFolioLi);
    
    // 버튼 클릭 이벤트 - 확장 프로그램 팝업 열기
    gitFolioButton.addEventListener('click', function(e) {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });
  })();