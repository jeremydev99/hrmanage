# Claude Code 작업 지시서 28
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_28.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]
[작업 완료 후 git push 하지 말 것]

---

## 작업 목표: 모바일 햄버거 메뉴 재설계

### 핵심 설계
```
헤더 (모바일):
  [≡] [㈜사이냅소프트 인사평가시스템]    [로그아웃]
  → 3요소만, 줄바꿈 없음, 사용자 정보 제거

햄버거 메뉴 (클릭 시):
  ┌─────────────────────────┐
  │ 👤 한개발 (일반사용자)   │ ← 사용자 정보
  │ 개발팀 주니어개발자      │
  ├─────────────────────────┤
  │ 📋 내 평가          ▼  │ ← 1레벨 (클릭 시 펼침)
  │   승인 관리              │ ← 2레벨 (연한 배경)
  │   중간 보고              │
  │   중간 피드백            │
  │   최종 평가              │
  ├─────────────────────────┤
  │ ⚙ 관리자 설정      ▼  │ ← 관리자만 표시
  │   (관리자 하위 탭들)     │
  └─────────────────────────┘
```

---

## 작업 1 — public/index.html: 헤더 구조 수정

### 1-1. 모바일 헤더 구조 확인 및 수정

현재 top-bar 구조를 찾아서
모바일에서 줄바꿈 없이 3요소만 표시되도록 수정:

```html
<div class="top-bar" style="display:flex;align-items:center;justify-content:space-between;
     height:52px;padding:0 12px;background:var(--o500);position:sticky;top:0;z-index:100">

  <!-- 좌측: 햄버거 + 로고 -->
  <div style="display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden">
    <!-- 햄버거 버튼 (모바일 480px 이하에서만 표시) -->
    <button id="hamburger-btn"
      style="display:none;background:none;border:none;cursor:pointer;padding:6px;
             flex-direction:column;gap:5px;align-items:center;justify-content:center;
             flex-shrink:0"
      onclick="toggleMobileMenu()">
      <span style="display:block;width:22px;height:2px;background:white;border-radius:2px"></span>
      <span style="display:block;width:22px;height:2px;background:white;border-radius:2px"></span>
      <span style="display:block;width:22px;height:2px;background:white;border-radius:2px"></span>
    </button>

    <!-- 로고 -->
    <div class="top-bar-logo" style="color:white;font-weight:700;white-space:nowrap;
         overflow:hidden;text-overflow:ellipsis">
      <span style="font-size:15px">㈜사이냅소프트</span>
      <span class="pc-only" style="font-size:12px;opacity:.8;margin-left:4px">인사평가 시스템</span>
    </div>
  </div>

  <!-- 가운데: PC용 사용자 정보 (모바일에서 숨김) -->
  <div class="top-bar-user pc-only" style="font-size:12px;color:white;opacity:.9;
       white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
    <!-- 기존 사용자 정보 -->
  </div>

  <!-- 우측: PC용 메뉴 탭 + 로그아웃 / 모바일 로그아웃만 -->
  <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
    <button class="btn btn-ghost btn-sm mobile-logout"
      style="color:white;border-color:rgba(255,255,255,.4);white-space:nowrap;font-size:13px"
      onclick="App.logout()">로그아웃</button>
  </div>
</div>
```

### 1-2. CSS에 pc-only 클래스 추가 (style.css)

```css
.pc-only { display: block; }

@media (max-width: 480px) {
  .pc-only { display: none !important; }
  #hamburger-btn { display: flex !important; }
}
```

---

## 작업 2 — 햄버거 메뉴 드롭다운 재설계

### 2-1. 햄버거 메뉴 HTML 구조 (app.js 또는 index.html)

toggleMobileMenu 함수를 아래로 교체:

```javascript
function toggleMobileMenu() {
  let menu = document.getElementById('mobile-nav-menu');
  if (menu) {
    menu.remove();
    return;
  }

  const user = App.user;
  const isAdmin = App.isAdmin();

  // 메뉴 아이템 정의
  const menuGroups = [
    {
      label: '내 평가',
      icon: '📋',
      items: [
        { label: '승인 관리',   tab: 'approvals' },
        { label: '중간 보고',   tab: 'progressReport' },
        { label: '중간 피드백', tab: 'feedback' },
        { label: '최종 평가',   tab: 'finalEval' },
      ]
    },
  ];

  if (isAdmin) {
    menuGroups.push({
      label: '관리자 설정',
      icon: '⚙',
      items: [
        { label: '계정 승인 관리',   tab: 'adm-accounts' },
        { label: '전직원 평가 현황', tab: 'adm-status' },
        { label: '목표 카테고리',    tab: 'adm-categories' },
        { label: '평가 기간 관리',   tab: 'adm-periods' },
        { label: '조직도 관리',      tab: 'adm-org-chart' },
        { label: '조직 관리',        tab: 'adm-org' },
        { label: '권한 관리',        tab: 'adm-roles' },
        { label: '평가 정책',        tab: 'adm-policy' },
        { label: '평가 등급',        tab: 'adm-grades' },
        { label: '감사 로그',        tab: 'adm-audit' },
      ]
    });
  }

  menu = document.createElement('div');
  menu.id = 'mobile-nav-menu';
  menu.style.cssText = `
    position: fixed;
    top: 52px;
    left: 0;
    right: 0;
    bottom: 0;
    background: white;
    z-index: 300;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0,0,0,.2);
  `;

  // 사용자 정보 헤더
  menu.innerHTML = `
    <div style="padding:16px;background:var(--o50);border-bottom:1px solid var(--o100)">
      <div style="font-size:15px;font-weight:700;color:var(--o800)">
        👤 ${user?.name || ''}
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">
        ${user?.dept || ''} ${user?.title || ''}
      </div>
      <div style="margin-top:6px">
        <span class="bd ${user?.role==='master'?'bd-locked':user?.role==='admin'?'bd-purple':'bd-approved'}"
          style="font-size:11px">
          ${user?.role==='master'?'마스터관리자':user?.role==='admin'?'관리자':'일반사용자'}
        </span>
      </div>
    </div>`;

  // 내 평가 상단 링크
  const myEvalLink = document.createElement('div');
  myEvalLink.style.cssText = 'padding:14px 16px;font-size:14px;font-weight:600;color:var(--o800);border-bottom:1px solid var(--o100);cursor:pointer;display:flex;align-items:center;gap:8px';
  myEvalLink.innerHTML = '📋 내 평가';
  myEvalLink.onclick = () => { closeMobileMenu(); App.navigate('myEval'); };
  menu.appendChild(myEvalLink);

  // 메뉴 그룹 렌더링
  menuGroups.forEach((group, gi) => {
    const groupDiv = document.createElement('div');
    groupDiv.style.cssText = 'border-bottom:1px solid var(--o100)';

    // 그룹 헤더 (아코디언)
    const groupHeader = document.createElement('div');
    groupHeader.style.cssText = `
      padding: 14px 16px;
      font-size: 14px;
      font-weight: 600;
      color: var(--o800);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${gi === 0 ? 'white' : 'var(--o50)'};
    `;
    groupHeader.innerHTML = `
      <span>${group.icon} ${group.label}</span>
      <span class="menu-arrow-${gi}" style="transition:transform .2s;font-size:12px">▼</span>`;

    // 하위 메뉴
    const subMenu = document.createElement('div');
    subMenu.id = `mobile-submenu-${gi}`;
    subMenu.style.cssText = 'display:none;background:var(--o50)';

    group.items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.style.cssText = `
        padding: 11px 16px 11px 32px;
        font-size: 13px;
        color: var(--o700);
        cursor: pointer;
        border-top: 1px solid var(--o100);
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      itemDiv.innerHTML = `<span style="color:var(--o300)">›</span> ${item.label}`;
      itemDiv.onclick = () => {
        closeMobileMenu();
        if (item.tab.startsWith('adm-')) {
          App.navigate('admin');
          setTimeout(() => switchTab(item.tab), 300);
        } else {
          App.navigate(item.tab);
        }
      };
      // 호버 효과
      itemDiv.addEventListener('touchstart', () => itemDiv.style.background = 'var(--o100)');
      itemDiv.addEventListener('touchend', () => itemDiv.style.background = '');
      subMenu.appendChild(itemDiv);
    });

    // 아코디언 토글
    groupHeader.onclick = () => {
      const isOpen = subMenu.style.display === 'block';
      subMenu.style.display = isOpen ? 'none' : 'block';
      const arrow = groupHeader.querySelector(`.menu-arrow-${gi}`);
      if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
    };

    groupDiv.appendChild(groupHeader);
    groupDiv.appendChild(subMenu);
    menu.appendChild(groupDiv);
  });

  // 로그아웃 버튼
  const logoutBtn = document.createElement('div');
  logoutBtn.style.cssText = 'padding:14px 16px;font-size:14px;color:#E53935;cursor:pointer;border-top:2px solid var(--o100);display:flex;align-items:center;gap:8px';
  logoutBtn.innerHTML = '🚪 로그아웃';
  logoutBtn.onclick = () => { closeMobileMenu(); App.logout(); };
  menu.appendChild(logoutBtn);

  // 외부 클릭 시 닫기 오버레이
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:299;background:transparent';
  overlay.onclick = closeMobileMenu;
  overlay.id = 'mobile-nav-overlay';
  document.body.appendChild(overlay);
  document.body.appendChild(menu);
}

function closeMobileMenu() {
  document.getElementById('mobile-nav-menu')?.remove();
  document.getElementById('mobile-nav-overlay')?.remove();
}
```

---

## 작업 3 — style.css: 헤더 간격 및 레이아웃 수정

기존 반응형 CSS에서 모바일 헤더 관련 수정:

```css
@media (max-width: 480px) {
  /* 헤더 사용자 정보 숨김 */
  .top-bar-user { display: none !important; }

  /* 로고 텍스트 줄바꿈 방지 */
  .top-bar-logo {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(100vw - 140px);
  }

  /* 헤더 우측 로그아웃 버튼만 */
  .top-bar-right {
    flex-shrink: 0;
  }

  /* 사용자 뱃지 간격 */
  .user-role-badge {
    margin-left: 4px;
  }
}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 모바일 햄버거 메뉴 재설계 (아코디언 2레벨, 사용자정보 메뉴 상단 이동) | Claude Code |
```

### 핵심 설계 원칙에 추가:
```
- 모바일 햄버거 메뉴:
  헤더: ≡ + 로고 + 로그아웃 (3요소만)
  메뉴: 사용자정보 + 내평가(아코디언) + 관리자설정(아코디언, 관리자만)
  아코디언: 클릭 시 하위 메뉴 펼침/접힘
  외부 클릭: 메뉴 자동 닫힘
```
