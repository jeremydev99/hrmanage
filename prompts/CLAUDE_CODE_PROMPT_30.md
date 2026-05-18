# Claude Code 작업 지시서 30
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_30.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]
[작업 완료 후 git push 하지 말 것]

---

## 작업 목표
1. PC 드롭다운 메뉴 (클릭 방식 + 0.15s 슬라이드 애니메이션)
2. 성과관리 메뉴 추가 + OKR 현황 대시보드
3. 세션 보안 정책 (브라우저 종료 + 시간 제한 최대 8시간)

---

## 최종 메뉴 구조
```
[내 평가 ▼]        [성과관리 ▼]       [관리자 설정 ▼]
  내 평가 홈          성과관리 홈
  승인 관리           중간 보고
  최종 평가           중간 피드백
                      🎯 OKR 현황

상위 메뉴 클릭: 드롭다운만 펼침 (페이지 이동 없음)
하위 메뉴 클릭: 해당 페이지로 이동
```

---

## 작업 1 — index.html: PC 드롭다운 메뉴 구조

기존 nav-tabs 버튼들을 아래 드롭다운 구조로 교체:

```html
<nav class="nav-tabs-wrap" style="display:flex;align-items:center;gap:2px;padding:0 8px">

  <!-- 내 평가 -->
  <div class="nav-dropdown" style="position:relative">
    <button class="nav-tab nav-dd-btn" onclick="toggleNavDD('dd-myeval',event)"
      style="display:flex;align-items:center;gap:4px">
      내 평가 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
    </button>
    <div id="dd-myeval" class="nav-dd-menu">
      <div class="dd-item" onclick="closeNavDD();App.navigate('myEval')">📋 내 평가 홈</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('approvals')">승인 관리</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('finalEval')">최종 평가</div>
    </div>
  </div>

  <!-- 성과관리 -->
  <div class="nav-dropdown" style="position:relative">
    <button class="nav-tab nav-dd-btn" onclick="toggleNavDD('dd-perf',event)"
      style="display:flex;align-items:center;gap:4px">
      성과관리 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
    </button>
    <div id="dd-perf" class="nav-dd-menu">
      <div class="dd-item" onclick="closeNavDD();App.navigate('perfHome')">📊 성과관리 홈</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('progressReport')">중간 보고</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('feedback')">중간 피드백</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('okrDashboard')">🎯 OKR 현황</div>
    </div>
  </div>

  <!-- 관리자 설정 (admin+만) -->
  <div class="nav-dropdown admin-only" style="position:relative;display:none">
    <button class="nav-tab nav-dd-btn" onclick="toggleNavDD('dd-admin',event)"
      style="display:flex;align-items:center;gap:4px">
      관리자 설정 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
    </button>
    <div id="dd-admin" class="nav-dd-menu" style="right:0;left:auto">
      <div class="dd-section-label">관리자 메뉴</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchTab('adm-accounts'),300)">계정 승인 관리</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchTab('adm-status'),300)">전직원 평가 현황</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchTab('adm-periods'),300)">평가 기간 관리</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchTab('adm-policy'),300)">평가 정책</div>
      <div class="dd-item" onclick="closeNavDD();App.navigate('admin')">관리자 설정 전체</div>
    </div>
  </div>

</nav>
```

---

## 작업 2 — style.css: 드롭다운 스타일 + 슬라이드 애니메이션

파일 끝에 추가:

```css
/* ── PC 드롭다운 메뉴 ─────────────────────── */
.nav-dd-menu {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: white;
  border-radius: 8px;
  min-width: 150px;
  box-shadow: 0 4px 20px rgba(0,0,0,.12);
  z-index: 200;
  overflow: hidden;
  border: 1px solid var(--o100);
  transform-origin: top center;
}

.nav-dd-menu.open {
  display: block;
  animation: ddSlideDown 0.15s ease-out forwards;
}

@keyframes ddSlideDown {
  from {
    opacity: 0;
    transform: scaleY(0.85) translateY(-6px);
  }
  to {
    opacity: 1;
    transform: scaleY(1) translateY(0);
  }
}

.dd-item {
  padding: 10px 16px;
  font-size: 13px;
  color: var(--o700);
  cursor: pointer;
  border-bottom: 1px solid var(--o50);
  transition: background .1s;
  white-space: nowrap;
}
.dd-item:last-child { border-bottom: none; }
.dd-item:hover {
  background: var(--o50);
  color: var(--o500);
}
.dd-section-label {
  padding: 6px 16px;
  font-size: 11px;
  color: var(--muted);
  background: var(--o50);
  border-bottom: 1px solid var(--o100);
  font-weight: 500;
}

/* 모바일에서 PC 드롭다운 숨김 */
@media (max-width: 480px) {
  .nav-tabs-wrap { display: none !important; }
}
```

---

## 작업 3 — app.js: 드롭다운 토글 함수 추가

```javascript
function toggleNavDD(id, e) {
  e?.stopPropagation();
  const target = document.getElementById(id);
  const isOpen = target?.classList.contains('open');
  closeNavDD();
  if (!isOpen && target) {
    target.classList.add('open');
    const btn = target.previousElementSibling;
    const arrow = btn?.querySelector('.dd-arrow');
    if (arrow) arrow.style.transform = 'rotate(180deg)';
    setTimeout(() => {
      document.addEventListener('click', closeNavDD, { once: true });
    }, 50);
  }
}

function closeNavDD() {
  document.querySelectorAll('.nav-dd-menu').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.nav-dropdown .dd-arrow').forEach(a => a.style.transform = '');
}

function updateNavForRole() {
  const isAdmin = ['master','admin'].includes(App.user?.role);
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'block' : 'none';
  });
}
```

App.navigate 함수와 로그인 완료 시점에 updateNavForRole() 호출 추가.

---

## 작업 4 — 모바일 햄버거 메뉴 업데이트

toggleMobileMenu 함수의 menuGroups를 아래로 교체:

```javascript
const menuGroups = [
  {
    label: '내 평가', icon: '📋', navigate: 'myEval',
    items: [
      { label: '내 평가 홈',  navigate: 'myEval' },
      { label: '승인 관리',   navigate: 'approvals' },
      { label: '최종 평가',   navigate: 'finalEval' },
    ]
  },
  {
    label: '성과관리', icon: '📊', navigate: null,
    items: [
      { label: '성과관리 홈', navigate: 'perfHome' },
      { label: '중간 보고',   navigate: 'progressReport' },
      { label: '중간 피드백', navigate: 'feedback' },
      { label: '🎯 OKR 현황', navigate: 'okrDashboard' },
    ]
  },
];
if (isAdmin) {
  menuGroups.push({
    label: '관리자 설정', icon: '⚙', navigate: 'admin',
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
```

---

## 작업 5 — app.js: Pages 추가

```javascript
// OKR 현황 대시보드 (조회 전용)
Pages.okrDashboard = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const cycles = await API.get('/okr').catch(() => []);
    area.innerHTML = '';
    const header = document.createElement('div');
    header.style.marginBottom = '16px';
    header.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:var(--o800)">🎯 OKR 현황</div>
      <div style="font-size:12px;color:var(--muted)">전체 기간 OKR 달성률 (편집은 내 평가 탭에서)</div>`;
    area.appendChild(header);
    if (!cycles.length) {
      area.innerHTML += `<div class="card"><div class="alert alert-orange">
        작성된 OKR이 없습니다.
        <button class="btn btn-ghost btn-sm" style="margin-left:8px"
          onclick="App.navigate('myEval')">내 평가로 이동 →</button>
      </div></div>`;
      return;
    }
    cycles.forEach(cycle => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '12px';
      let totalKRs = 0, totalPct = 0;
      cycle.objectives.forEach(obj =>
        obj.key_results.forEach(kr => {
          totalKRs++;
          totalPct += kr.target_value > 0 ? (kr.current_value/kr.target_value)*100 : 0;
        })
      );
      const avg = totalKRs > 0 ? Math.round(totalPct/totalKRs) : 0;
      const col = avg>=70?'var(--green)':avg>=40?'var(--o500)':'#E53935';
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:15px;font-weight:600">${cycle.period_label}</div>
            <div style="font-size:12px;color:var(--muted)">${cycle.eval_year} · OKR</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:28px;font-weight:800;color:${col}">${avg}%</div>
            <div style="font-size:11px;color:var(--muted)">전체 달성률</div>
          </div>
        </div>
        <div style="background:var(--o100);border-radius:20px;height:10px;margin-bottom:16px">
          <div style="background:${col};border-radius:20px;height:100%;
                      width:${Math.min(avg,100)}%;transition:width .4s"></div>
        </div>
        ${cycle.objectives.map((obj,oi) => {
          const op = obj.key_results.length
            ? Math.round(obj.key_results.reduce((a,kr)=>
                a+(kr.target_value>0?(kr.current_value/kr.target_value)*100:0),0)
                /obj.key_results.length) : 0;
          const oc = op>=70?'var(--green)':op>=40?'var(--o500)':'#E53935';
          return `<div style="border:1px solid var(--border);border-radius:8px;
                               padding:12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="font-size:13px;font-weight:600;color:var(--o800)">
                🎯 O${oi+1}. ${obj.title}</div>
              <span style="font-size:14px;font-weight:700;color:${oc}">${op}%</span>
            </div>
            ${obj.key_results.map((kr,ki) => {
              const kp = kr.target_value>0?Math.round((kr.current_value/kr.target_value)*100):0;
              const kc = kp>=70?'var(--green)':kp>=40?'var(--o500)':'#E53935';
              return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;
                                  font-size:12px;border-top:1px solid var(--o50)">
                <span style="color:var(--muted);white-space:nowrap">KR${ki+1}</span>
                <span style="flex:1;color:var(--o700)">${kr.title}</span>
                <span style="color:var(--muted);white-space:nowrap">
                  ${kr.current_value}/${kr.target_value}${kr.unit}</span>
                <div style="width:80px;background:var(--o100);border-radius:10px;height:6px;flex-shrink:0">
                  <div style="background:${kc};border-radius:10px;height:100%;
                              width:${Math.min(kp,100)}%"></div>
                </div>
                <span style="font-weight:700;color:${kc};width:36px;text-align:right">${kp}%</span>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}`;
      area.appendChild(card);
    });
  } catch(err) {
    area.innerHTML = `<div class="alert alert-red">오류: ${err.message}</div>`;
  }
};

// 성과관리 홈 (프롬프트 31에서 상세 구현)
Pages.perfHome = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:18px;font-weight:700;color:var(--o800)">📊 성과관리 홈</div>
      <div style="font-size:12px;color:var(--muted)">기간별 성과 요약 및 AI 분석</div>
    </div>
    <div class="card">
      <div class="alert alert-teal">
        🚧 성과관리 대시보드 준비 중입니다.
        <div style="font-size:12px;margin-top:4px">
          중간 보고, 중간 피드백, OKR 현황은 각 메뉴에서 확인하세요.
        </div>
      </div>
    </div>`;
};
```

---

## 작업 6 — 세션 보안 정책

### 6-1. server/index.js: 세션 정책 API 추가

```javascript
// 세션 정책 조회
app.get('/api/settings/session-policy', auth, (req, res) => {
  try {
    const policy = db.prepare(
      "SELECT value FROM app_settings WHERE key='session_policy'"
    ).get();
    res.json(JSON.parse(policy?.value ||
      '{"close_on_browser_close":false,"timeout_minutes":480}'));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 세션 정책 설정 (master만)
app.post('/api/settings/session-policy', auth, masterOnly, (req, res) => {
  try {
    const { close_on_browser_close, timeout_minutes } = req.body;
    const safeTimeout = Math.min(parseInt(timeout_minutes) || 480, 480);
    if (safeTimeout < 1)
      return res.status(400).json({ error: '최소 1분 이상이어야 합니다.' });
    const policy = {
      close_on_browser_close: !!close_on_browser_close,
      timeout_minutes: safeTimeout
    };
    db.prepare(`
      INSERT INTO app_settings(key,value,updated_by,updated_at)
      VALUES('session_policy',?,?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value=excluded.value, updated_by=excluded.updated_by,
        updated_at=excluded.updated_at
    `).run(JSON.stringify(policy), req.user.sub);
    auditLog(req.user.sub, 'SESSION_POLICY_CHANGED', null, null,
      `세션 정책 변경: 브라우저종료=${policy.close_on_browser_close}, 만료=${safeTimeout}분`, req.ip);
    res.json({ success: true, policy });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

### 6-2. admin.js: 평가 정책 탭에 세션 보안 UI 추가

renderAdmPolicy Promise.all에 추가:
```javascript
API.get('/settings/session-policy').catch(() =>
  ({ close_on_browser_close: false, timeout_minutes: 480 })),
```

정책 UI에 세션 보안 섹션 추가 (다른 policy-row들과 함께):
```javascript
<!-- 세션 보안 정책 -->
<div style="margin-bottom:20px;padding-bottom:20px;border-bottom:2px solid var(--o100)">
  <div style="font-size:14px;font-weight:600;margin-bottom:12px">🔐 세션 보안 정책</div>

  <div class="policy-row">
    <div>
      <div style="font-size:13px;font-weight:500">브라우저 종료 시 자동 로그아웃</div>
      <div style="font-size:12px;color:var(--muted)">탭/브라우저 닫으면 즉시 세션 만료</div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" id="session-close-on-browser"
        ${sessionPolicy.close_on_browser_close ? 'checked' : ''}
        style="width:16px;height:16px">
      <span style="font-size:13px">
        ${sessionPolicy.close_on_browser_close ? '켜짐' : '꺼짐'}
      </span>
    </label>
  </div>

  <div style="margin-top:12px">
    <div style="font-size:13px;font-weight:500;margin-bottom:8px">세션 유지 시간</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      ${[5,10,30,60].map(m => `
        <button class="btn btn-sm session-timeout-btn
          ${sessionPolicy.timeout_minutes===m?'btn-primary':'btn-ghost'}"
          onclick="selectSessionTimeout(${m},this)" style="font-size:12px">
          ${m>=60?m/60+'시간':m+'분'}
        </button>`).join('')}
      <div style="display:flex;align-items:center;gap:4px">
        <input id="session-custom-hours" type="number" min="1" max="8"
          placeholder="직접입력"
          value="${![5,10,30,60].includes(sessionPolicy.timeout_minutes)&&sessionPolicy.timeout_minutes<480
            ? Math.round(sessionPolicy.timeout_minutes/60) : ''}"
          style="width:70px;height:32px;font-size:12px;text-align:center">
        <span style="font-size:12px;color:var(--muted)">시간 (최대 8시간)</span>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:6px">
      ⚠ 최대 8시간을 초과할 수 없습니다.
      현재: ${sessionPolicy.timeout_minutes>=60
        ? Math.round(sessionPolicy.timeout_minutes/60)+'시간'
        : sessionPolicy.timeout_minutes+'분'}
    </div>
  </div>

  <button class="btn btn-primary btn-sm" style="margin-top:12px"
    onclick="saveSessionPolicy()">세션 정책 저장</button>
</div>
```

함수 추가:
```javascript
let _sessionTimeoutSel = null;

function selectSessionTimeout(minutes, btn) {
  _sessionTimeoutSel = minutes;
  document.querySelectorAll('.session-timeout-btn').forEach(b => {
    b.classList.remove('btn-primary');
    b.classList.add('btn-ghost');
  });
  btn.classList.remove('btn-ghost');
  btn.classList.add('btn-primary');
  document.getElementById('session-custom-hours').value = '';
}

async function saveSessionPolicy() {
  const closeOnBrowser = document.getElementById('session-close-on-browser')?.checked;
  const customH = parseFloat(document.getElementById('session-custom-hours')?.value);
  let timeout = _sessionTimeoutSel || 480;
  if (!isNaN(customH) && customH > 0) timeout = Math.round(customH * 60);
  if (timeout > 480) { showAlert('최대 8시간을 초과할 수 없습니다.', 'red'); return; }
  try {
    await API.post('/settings/session-policy', {
      close_on_browser_close: closeOnBrowser,
      timeout_minutes: timeout
    });
    showAlert(`세션 정책 저장 완료 (${
      timeout>=60?Math.round(timeout/60)+'시간':timeout+'분'
    }${closeOnBrowser?', 브라우저 종료 시 만료':''})`, 'green');
    _sessionTimeoutSel = null;
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

### 6-3. app.js: 세션 정책 적용

```javascript
// 토큰 조회 (localStorage + sessionStorage 둘 다 확인)
function getToken() {
  return localStorage.getItem('synap_token')
    || sessionStorage.getItem('synap_token');
}

// 로그인 완료 후 세션 정책 적용
async function applySessionPolicy(token) {
  try {
    const policy = await fetch('/api/settings/session-policy', {
      headers: { Authorization: 'Bearer ' + token }
    }).then(r => r.json());

    if (policy.close_on_browser_close) {
      sessionStorage.setItem('synap_token', token);
      localStorage.removeItem('synap_token');
    } else {
      localStorage.setItem('synap_token', token);
      sessionStorage.removeItem('synap_token');
    }

    if (policy.timeout_minutes && policy.timeout_minutes < 480) {
      const expireAt = Date.now() + policy.timeout_minutes * 60 * 1000;
      localStorage.setItem('synap_expire', expireAt.toString());
    } else {
      localStorage.removeItem('synap_expire');
    }
  } catch(e) {
    localStorage.setItem('synap_token', token);
  }
}

// 1분마다 세션 만료 체크
function startSessionCheck() {
  setInterval(() => {
    const exp = localStorage.getItem('synap_expire');
    if (exp && Date.now() > parseInt(exp)) {
      localStorage.removeItem('synap_token');
      localStorage.removeItem('synap_expire');
      sessionStorage.removeItem('synap_token');
      showAlert('세션이 만료되었습니다. 다시 로그인해주세요.', 'orange');
      setTimeout(() => App.logout(), 1500);
    }
  }, 60 * 1000);
}
```

기존 localStorage.getItem('synap_token') → getToken() 으로 교체.
로그인 완료 시 applySessionPolicy(token) 호출.
앱 초기화 시 startSessionCheck() 호출.

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | PC 드롭다운 메뉴(0.15s 슬라이드 애니), 성과관리 메뉴, OKR 현황, 세션 보안 정책 | Claude Code |
```

### API 목록에 추가:
```
GET  /api/settings/session-policy   세션 정책 조회
POST /api/settings/session-policy   세션 정책 설정 (master)
```

### 핵심 설계 원칙에 추가:
```
- PC 드롭다운:
  상위 클릭: 드롭다운만 펼침 (이동 없음)
  하위 클릭: 페이지 이동
  애니메이션: 0.15s scaleY + translateY
- 세션 보안 (app_settings.session_policy JSON):
  close_on_browser_close: sessionStorage 사용
  timeout_minutes: 만료 시각 localStorage 저장, 1분마다 체크
  최대 8시간 강제 제한
  관리: 관리자 설정 → 평가 정책 (master만)
- 성과관리 홈: Pages.perfHome (프롬프트 31 상세 구현)
- OKR 현황: Pages.okrDashboard (조회 전용)
```
