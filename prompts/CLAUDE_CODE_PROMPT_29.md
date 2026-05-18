# Claude Code 작업 지시서 29
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_29.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]
[작업 완료 후 git push 하지 말 것]

---

## 작업 목표
1. 햄버거 메뉴 1레벨 헤더 분리 (탭 이동 + 아코디언 토글 분리)
2. 로그인 화면 공지사항 기능 추가

---

## 작업 1 — app.js: 햄버거 메뉴 1레벨 헤더 분리

toggleMobileMenu 함수에서
그룹 헤더 부분을 아래로 교체:

```javascript
// 그룹 헤더: 좌측(탭 이동) + 우측(아코디언 토글) 분리
const groupHeader = document.createElement('div');
groupHeader.style.cssText = `
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--o100);
  background: white;
`;

// 좌측: 탭 이동 버튼
const groupLabel = document.createElement('div');
groupLabel.style.cssText = `
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--o800);
  cursor: pointer;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
`;
groupLabel.innerHTML = `${group.icon} ${group.label}`;
groupLabel.onclick = () => {
  closeMobileMenu();
  if (group.label === '내 평가') App.navigate('myEval');
  else if (group.label === '관리자 설정') App.navigate('admin');
};

// 우측: 아코디언 토글 버튼
const groupToggle = document.createElement('div');
groupToggle.style.cssText = `
  padding: 14px 16px;
  cursor: pointer;
  color: var(--muted);
  font-size: 12px;
  border-left: 1px solid var(--o100);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
`;
groupToggle.innerHTML = `<span class="menu-arrow-${gi}" style="transition:transform .2s;display:inline-block">▼</span>`;
groupToggle.onclick = () => {
  const isOpen = subMenu.style.display === 'block';
  subMenu.style.display = isOpen ? 'none' : 'block';
  const arrow = groupToggle.querySelector(`.menu-arrow-${gi}`);
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
};

groupHeader.appendChild(groupLabel);
groupHeader.appendChild(groupToggle);
```

그리고 기존 '내 평가 상단 링크' 별도 항목은 제거
(중복이므로 groupLabel onclick으로 대체됨)

---

## 작업 2 — server/index.js: 공지사항 DB 및 API

### 2-1. migrations에 추가
```javascript
"ALTER TABLE app_settings ADD COLUMN updated_by INTEGER",
"ALTER TABLE app_settings ADD COLUMN updated_at TEXT",
```

### 2-2. 공지사항 초기 데이터 마이그레이션 (initDB 함수 안)

현재 login.js에 하드코딩된 테스트 계정 목록을
CEO(id=1)가 작성한 공지로 마이그레이션:

```javascript
const noticeExists = db.prepare(
  "SELECT value FROM app_settings WHERE key='notice'"
).get();
if (!noticeExists) {
  const noticeContent = `테스트 계정 안내

[마스터관리자] ceo@synapsoft.com / admin1234
[인사팀장] hr1@synapsoft.com / admin1234
[인사팀원] hr2@synapsoft.com / admin1234
[개발팀장] dev1@synapsoft.com / user1234
[시니어개발자] dev2@synapsoft.com / user1234
[주니어개발자] dev3@synapsoft.com / user1234
[영업팀장] sales1@synapsoft.com / user1234
[영업사원] sales2@synapsoft.com / user1234`;

  db.prepare(`
    INSERT INTO app_settings(key, value, updated_by, updated_at)
    VALUES('notice', ?, 1, datetime('now'))
  `).run(noticeContent);
  console.log('[DB] 공지사항 초기 데이터 생성 완료');
}
```

### 2-3. 공지사항 API 추가

```javascript
// 공지사항 조회 (인증 불필요 - 로그인 화면에서도 사용)
app.get('/api/notice', (req, res) => {
  try {
    const notice = db.prepare(
      "SELECT value, updated_by, updated_at FROM app_settings WHERE key='notice'"
    ).get();
    if (!notice) return res.json({ content: '', author: null, updated_at: null });

    const author = notice.updated_by
      ? db.prepare('SELECT name, title FROM users WHERE id=?').get(notice.updated_by)
      : null;

    res.json({
      content: notice.value || '',
      author_name: author?.name || '',
      author_title: author?.title || '',
      updated_at: notice.updated_at || '',
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 공지사항 수정 (admin+)
app.post('/api/notice', auth, adminOnly, (req, res) => {
  try {
    const { content } = req.body;
    db.prepare(`
      INSERT INTO app_settings(key, value, updated_by, updated_at)
      VALUES('notice', ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value=excluded.value,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at
    `).run(content || '', req.user.sub);

    auditLog(req.user.sub, 'NOTICE_UPDATED', null, null,
      `공지사항 수정 (${(content||'').length}자)`, req.ip);

    const author = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.sub);
    res.json({ success: true, author_name: author?.name });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

---

## 작업 3 — public/js/pages/login.js: 공지사항 표시

### 3-1. 현재 하드코딩된 테스트 계정 목록 제거

login.js에서 테스트 계정 목록 HTML 부분을 찾아서
아래 공지사항 동적 로드로 교체:

```javascript
// 페이지 로드 시 공지사항 로드
async function loadNotice() {
  try {
    const data = await fetch('/api/notice').then(r => r.json());
    const container = document.getElementById('notice-container');
    if (!container) return;

    if (!data.content) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `
      <div style="
        background: var(--o50);
        border: 1px solid var(--o200);
        border-radius: 8px;
        padding: 14px;
        margin-top: 12px;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:8px;flex-wrap:wrap;gap:4px">
          <div style="font-size:12px;font-weight:600;color:var(--o600)">📢 공지사항</div>
          ${data.author_name ? `
          <div style="font-size:11px;color:var(--muted)">
            ${data.author_name} ${data.author_title||''} ·
            ${(data.updated_at||'').slice(0,10)}
          </div>` : ''}
        </div>
        <div style="
          font-size:12px;
          color:var(--o800);
          white-space:pre-wrap;
          line-height:1.6;
          max-height:160px;
          overflow-y:auto;
        ">${data.content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      </div>`;
  } catch(e) {
    console.log('공지사항 로드 실패:', e.message);
  }
}
```

### 3-2. 로그인 폼 HTML에 공지 컨테이너 추가

로그인 카드 하단에:
```html
<div id="notice-container" style="display:none"></div>
```

### 3-3. 로그인 페이지 렌더링 시 loadNotice() 호출

Pages.login 함수 끝부분에:
```javascript
loadNotice();
```

---

## 작업 4 — admin.js: 평가 정책 탭에 공지사항 편집 UI 추가

### renderAdmPolicy 함수에 공지사항 섹션 추가

Promise.all에 공지 로드 추가:
```javascript
API.get('/api/notice').catch(() => ({ content: '', author_name: '', updated_at: '' })),
```

정책 UI 상단에 공지사항 섹션 추가:
```javascript
<!-- 공지사항 편집 -->
<div style="margin-bottom:20px;padding-bottom:20px;border-bottom:2px solid var(--o100)">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:14px;font-weight:600">📢 로그인 화면 공지사항</div>
      ${notice.author_name ? `
      <div style="font-size:11px;color:var(--muted);margin-top:2px">
        최근 수정: ${notice.author_name} ${notice.author_title||''} · ${(notice.updated_at||'').slice(0,16)}
      </div>` : '<div style="font-size:11px;color:var(--muted)">작성된 공지가 없습니다</div>'}
    </div>
    <button class="btn btn-primary btn-sm" onclick="saveNotice()">저장하기</button>
  </div>
  <textarea id="notice-textarea"
    placeholder="로그인 화면에 표시할 공지사항을 입력하세요..."
    style="width:100%;min-height:120px;font-size:13px;resize:vertical;
           padding:10px;border-radius:6px;border:1px solid var(--border)"
  >${notice.content || ''}</textarea>
  <div style="font-size:11px;color:var(--muted);margin-top:4px">
    공지 내용이 없으면 로그인 화면에 공지 영역이 표시되지 않습니다.
  </div>
</div>
```

saveNotice 함수 추가:
```javascript
async function saveNotice() {
  const content = document.getElementById('notice-textarea')?.value || '';
  try {
    const r = await API.post('/api/notice', { content });
    showAlert(`공지사항이 저장되었습니다. (저장자: ${r.author_name||''})`, 'green');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 햄버거 메뉴 1레벨 탭이동/아코디언 분리, 로그인 공지사항 기능 추가 (DB마이그레이션, 감사로그) | Claude Code |
```

### API 목록에 추가:
```
GET  /api/notice   공지사항 조회 (인증 불필요)
POST /api/notice   공지사항 수정 (admin+, 감사로그)
```

### 핵심 설계 원칙에 추가:
```
- 로그인 공지사항:
  app_settings.notice (value, updated_by, updated_at)
  GET /api/notice: 인증 없이 조회 가능
  수정 시 감사 로그 자동 기록
  관리 위치: 관리자 설정 → 평가 정책 탭 상단
  표시: 작성자명 + 직책 + 날짜 표시
```
