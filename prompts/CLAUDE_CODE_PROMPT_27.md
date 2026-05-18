# Claude Code 작업 지시서 27
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_27.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]
[작업 완료 후 git push 하지 말 것]

---

## 작업 목표: 반응형 UI (모바일 대응)

### 핵심 원칙
```
PC (1024px+):   현재 UI 완전 유지
태블릿 (768px): 일부 요소 재배치
모바일 (480px): 햄버거 메뉴 + 세로 스택 레이아웃
버튼 줄바꿈:    white-space:nowrap + min-width로 방지
```

---

## 작업 1 — public/css/style.css: 반응형 CSS 추가

파일 맨 끝에 아래 내용 추가:

```css
/* ── 반응형 레이아웃 ─────────────────────────── */

/* 태블릿 (768px 이하) */
@media (max-width: 768px) {
  /* 헤더 */
  .top-bar {
    padding: 0 12px;
    height: 52px;
  }
  .top-bar .user-info {
    display: none;
  }

  /* 메뉴 탭 */
  .nav-tabs {
    overflow-x: auto;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding: 0 8px;
  }
  .nav-tabs::-webkit-scrollbar { display: none; }
  .nav-tab {
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* 카드 */
  .card {
    padding: 14px;
    margin-bottom: 10px;
  }

  /* 버튼 줄바꿈 방지 */
  .btn {
    white-space: nowrap;
  }
  .btn-sm {
    min-width: fit-content;
    white-space: nowrap;
  }

  /* abar (버튼 영역) */
  .abar {
    flex-wrap: wrap;
    gap: 8px;
  }

  /* 평가 플로우바 */
  .flow-bar {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}

/* 모바일 (480px 이하) */
@media (max-width: 480px) {
  /* 햄버거 메뉴 버튼 표시 */
  .hamburger-btn {
    display: flex !important;
  }

  /* 상단 메뉴 탭 숨김 → 드롭다운으로 대체 */
  .nav-tabs-wrap {
    display: none;
  }
  .nav-tabs-wrap.mobile-open {
    display: flex !important;
    position: fixed;
    top: 52px;
    left: 0;
    right: 0;
    background: var(--white);
    flex-direction: column;
    z-index: 200;
    box-shadow: 0 4px 12px rgba(0,0,0,.15);
    padding: 8px 0;
    max-height: calc(100vh - 52px);
    overflow-y: auto;
  }
  .nav-tabs-wrap.mobile-open .nav-tab {
    padding: 12px 20px;
    border-bottom: 1px solid var(--o50);
    border-radius: 0;
    font-size: 14px;
    text-align: left;
    width: 100%;
  }
  .nav-tabs-wrap.mobile-open .nav-tab.active {
    background: var(--o50);
    color: var(--o500);
  }

  /* 상단 바 */
  .top-bar {
    padding: 0 12px;
  }
  .top-bar-logo {
    font-size: 14px;
  }
  .top-bar-right {
    gap: 6px;
  }
  .top-bar-right .user-role-badge {
    display: none;
  }

  /* 메인 영역 */
  #main-area {
    padding: 12px;
  }

  /* 카드 */
  .card {
    padding: 12px;
    border-radius: 8px;
  }

  /* 카드 헤더 */
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  /* 버튼 그룹 */
  .btn-group {
    flex-wrap: wrap;
    gap: 6px;
  }
  .btn {
    white-space: nowrap;
    min-width: fit-content;
  }

  /* 폼 입력 */
  input, select, textarea {
    font-size: 16px !important; /* iOS 자동 확대 방지 */
  }

  /* 평가 카드 버튼 영역 */
  .eval-card-actions {
    flex-direction: column;
    width: 100%;
  }
  .eval-card-actions .btn {
    width: 100%;
    text-align: center;
  }

  /* 테이블 → 카드 변환 */
  .resp-table thead {
    display: none;
  }
  .resp-table tr {
    display: block;
    margin-bottom: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
  }
  .resp-table td {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    border: none;
    font-size: 13px;
  }
  .resp-table td::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--muted);
    font-size: 11px;
    min-width: 80px;
  }

  /* 플로우바 */
  .flow-bar {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 4px;
  }
  .flow-step-label {
    font-size: 10px;
  }

  /* 관리자 탭 */
  .adm-tabs {
    overflow-x: auto;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    gap: 4px;
    padding: 8px 0;
  }
  .adm-tabs::-webkit-scrollbar { display: none; }
  .adm-tab {
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 12px;
    padding: 5px 10px;
  }

  /* policy-row */
  .policy-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  /* OKR 카드 */
  .okr-kr-row {
    flex-wrap: wrap;
    gap: 6px;
  }
}
```

---

## 작업 2 — public/index.html: 햄버거 버튼 추가

### 2-1. 상단 헤더에 햄버거 버튼 추가

현재 top-bar 구조를 찾아서
로고 옆에 햄버거 버튼 추가:

```html
<!-- 햄버거 버튼 (모바일 전용, 기본 hidden) -->
<button id="hamburger-btn" class="hamburger-btn"
  style="display:none;background:none;border:none;cursor:pointer;
         padding:6px;flex-direction:column;gap:4px;align-items:center;justify-content:center"
  onclick="toggleMobileMenu()">
  <span style="display:block;width:20px;height:2px;background:var(--white);border-radius:2px"></span>
  <span style="display:block;width:20px;height:2px;background:var(--white);border-radius:2px"></span>
  <span style="display:block;width:20px;height:2px;background:var(--white);border-radius:2px"></span>
</button>
```

### 2-2. nav-tabs 감싸는 div에 클래스 추가

현재 nav-tabs를 감싸는 div를 찾아서
`nav-tabs-wrap` 클래스 추가.

---

## 작업 3 — public/js/app.js: 햄버거 메뉴 토글 함수 추가

app.js 파일 끝에 추가:

```javascript
// 모바일 햄버거 메뉴 토글
function toggleMobileMenu() {
  const wrap = document.querySelector('.nav-tabs-wrap');
  if (!wrap) return;
  wrap.classList.toggle('mobile-open');

  // 메뉴 외부 클릭 시 닫기
  if (wrap.classList.contains('mobile-open')) {
    setTimeout(() => {
      document.addEventListener('click', closeMobileMenuOnOutside, { once: true });
    }, 100);
  }
}

function closeMobileMenuOnOutside(e) {
  const wrap = document.querySelector('.nav-tabs-wrap');
  const btn  = document.getElementById('hamburger-btn');
  if (wrap && !wrap.contains(e.target) && !btn?.contains(e.target)) {
    wrap.classList.remove('mobile-open');
  }
}

// 메뉴 탭 클릭 시 모바일 메뉴 닫기
function closeMobileMenu() {
  document.querySelector('.nav-tabs-wrap')?.classList.remove('mobile-open');
}
```

### 기존 App.navigate 또는 탭 클릭 함수에 closeMobileMenu() 호출 추가

switchTab 함수 또는 nav-tab 클릭 핸들러에:
```javascript
closeMobileMenu(); // 모바일 메뉴 닫기
```

---

## 작업 4 — 버튼 줄바꿈 방지 (핵심 UI 요소)

### MBO/OKR/KPI 선택 버튼

평가기간 관리 탭의 MBO/OKR/KPI 버튼들:
```javascript
// 각 버튼에 white-space:nowrap 추가 (이미 CSS에서 처리됨)
// btn-sm 클래스에 min-width 추가
```

### 관리자 탭 버튼들

adm-tab 버튼들이 모바일에서 가로 스크롤로 표시되도록
`adm-tabs` div에 클래스 추가 확인.

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 반응형 UI 추가 (모바일 햄버거 메뉴, 버튼 줄바꿈 방지, 768px/480px 미디어쿼리) | Claude Code |
```

### 핵심 설계 원칙에 추가:
```
- 반응형 브레이크포인트:
  768px: 탭 가로 스크롤, user-info 숨김
  480px: 햄버거 메뉴, 세로 스택 레이아웃
  버튼: white-space:nowrap으로 줄바꿈 방지
  입력폼: font-size:16px (iOS 자동 확대 방지)
```
