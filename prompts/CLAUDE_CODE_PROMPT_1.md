# Claude Code 작업 지시서
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]

아래 5가지 문제를 모두 수정해줘.

---

## 수정 1 — 신규 가입 신청 및 계정 승인 기능 추가

### 1-1. server/index.js 수정

#### (A) users 테이블에 컬럼 2개 추가
initDB() 함수 안의 CREATE TABLE IF NOT EXISTS users 구문을 아래로 교체해줘:
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role TEXT DEFAULT 'user',
  dept TEXT, title TEXT, manager_id INTEGER,
  is_active INTEGER DEFAULT 1,
  account_status TEXT DEFAULT 'approved',
  signup_note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### (B) 로그인 API에 account_status 체크 추가
기존 POST /api/auth/login 핸들러에서 토큰 발급 직전에 아래 체크 로직을 추가해줘:
```javascript
if (user.account_status === 'pending')
  return res.status(403).json({ error: '가입 승인 대기 중입니다. 관리자의 승인을 기다려주세요.' });
if (user.account_status === 'rejected')
  return res.status(403).json({ error: '가입이 거절되었습니다. 관리자에게 문의하세요.' });
```

#### (C) 신규 API 4개 추가 (GET /api/users 바로 위에 삽입)

```javascript
// 가입 신청 (인증 불필요)
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password, dept, title, signup_note } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email))
    return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users(name,email,password_hash,role,dept,title,account_status,signup_note,is_active) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(name, email, hash, 'user', dept||'', title||'', 'pending', signup_note||'', 0);
  res.json({ success: true, message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.' });
});

// 가입 신청 목록 (admin+)
app.get('/api/users/signup-requests', auth, adminOnly, (req, res) => {
  res.json(db.prepare(
    "SELECT id,name,email,dept,title,signup_note,account_status,created_at FROM users WHERE account_status IN ('pending','rejected') ORDER BY created_at DESC"
  ).all());
});

// 가입 승인 (admin+)
app.post('/api/users/:id/approve', auth, adminOnly, (req, res) => {
  const { role, dept, title, manager_id } = req.body;
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(req.params.id))
    return res.status(404).json({ error: '사용자 없음' });
  db.prepare(
    "UPDATE users SET account_status='approved',is_active=1,role=?,dept=COALESCE(?,dept),title=COALESCE(?,title),manager_id=? WHERE id=?"
  ).run(role||'user', dept||null, title||null, manager_id||null, req.params.id);
  db.prepare("INSERT INTO audit_logs(user_id,action,ip) VALUES(?,?,?)")
    .run(req.user.sub, 'ACCOUNT_APPROVED:'+req.params.id, req.ip);
  res.json({ success: true });
});

// 가입 거절 (admin+)
app.post('/api/users/:id/reject', auth, adminOnly, (req, res) => {
  db.prepare("UPDATE users SET account_status='rejected',is_active=0 WHERE id=?").run(req.params.id);
  db.prepare("INSERT INTO audit_logs(user_id,action,ip) VALUES(?,?,?)")
    .run(req.user.sub, 'ACCOUNT_REJECTED:'+req.params.id, req.ip);
  res.json({ success: true });
});

// 계정 활성/비활성 토글 (admin+)
app.post('/api/users/:id/toggle-active', auth, adminOnly, (req, res) => {
  const u = db.prepare('SELECT is_active FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: '사용자 없음' });
  const next = u.is_active ? 0 : 1;
  db.prepare('UPDATE users SET is_active=? WHERE id=?').run(next, req.params.id);
  db.prepare("INSERT INTO audit_logs(user_id,action,ip) VALUES(?,?,?)")
    .run(req.user.sub, (next?'ACCOUNT_ENABLED':'ACCOUNT_DISABLED')+':'+req.params.id, req.ip);
  res.json({ success: true, is_active: next });
});
```

---

### 1-2. public/js/pages/login.js 전체 교체

파일 전체를 아래 내용으로 교체해줘:

```javascript
Pages = window.Pages || {};
Pages.login = function() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-header">
        <div class="login-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>
          </svg>
        </div>
        <div class="login-title">㈜사이냅소프트</div>
        <div class="login-sub">인사평가 시스템</div>
      </div>
      <div class="login-body">
        <div id="login-alert"></div>
        <div class="form-group" style="margin-bottom:12px">
          <label>이메일</label>
          <input type="email" id="l-email" placeholder="이메일 입력" value="dev3@synapsoft.com">
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>비밀번호</label>
          <input type="password" id="l-pw" placeholder="비밀번호 입력" value="user1234"
            onkeydown="if(event.key==='Enter')doLogin()">
        </div>
        <button class="btn btn-primary" style="width:100%;margin-bottom:10px" onclick="doLogin()">로그인</button>
        <button class="btn btn-ghost" style="width:100%;font-size:13px" onclick="showSignupModal()">신규 가입 신청</button>
        <div class="login-hint">
          <strong>테스트 계정</strong><br>
          [마스터관리자] ceo@synapsoft.com / admin1234<br>
          [인사팀장] hr1@synapsoft.com / admin1234<br>
          [인사팀원] hr2@synapsoft.com / admin1234<br>
          [개발팀장] dev1@synapsoft.com / user1234<br>
          [시니어개발자] dev2@synapsoft.com / user1234<br>
          [주니어개발자] dev3@synapsoft.com / user1234<br>
          [영업팀장] sales1@synapsoft.com / user1234<br>
          [영업사원] sales2@synapsoft.com / user1234
        </div>
      </div>
    </div>

    <div id="signup-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,.5);z-index:200;align-items:center;justify-content:center">
      <div style="background:var(--white);border-radius:16px;padding:28px;width:100%;
        max-width:440px;margin:20px;max-height:90vh;overflow-y:auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
          <div style="font-size:16px;font-weight:600">신규 가입 신청</div>
          <button onclick="hideSignupModal()"
            style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted);line-height:1">×</button>
        </div>
        <div id="signup-alert"></div>
        <div class="form-row">
          <div class="form-group">
            <label>이름 *</label>
            <input id="su-name" placeholder="홍길동">
          </div>
          <div class="form-group">
            <label>이메일 *</label>
            <input type="email" id="su-email" placeholder="hong@synapsoft.com">
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <label>비밀번호 * (8자 이상)</label>
          <input type="password" id="su-pw" placeholder="비밀번호 입력">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>부서</label>
            <input id="su-dept" placeholder="개발팀">
          </div>
          <div class="form-group">
            <label>직책</label>
            <input id="su-title" placeholder="사원">
          </div>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>가입 사유 (선택)</label>
          <textarea id="su-note" placeholder="가입 신청 사유를 간략히 작성하세요..."
            style="width:100%;min-height:72px;resize:vertical"></textarea>
        </div>
        <div class="alert alert-orange" style="font-size:12px;margin-bottom:14px">
          가입 신청 후 관리자 승인이 완료되면 로그인 가능합니다.
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" style="flex:1" onclick="hideSignupModal()">취소</button>
          <button class="btn btn-primary" style="flex:2" onclick="doSignup()">가입 신청</button>
        </div>
      </div>
    </div>`;
};

function showSignupModal() {
  const ov = document.getElementById('signup-overlay');
  ov.style.display = 'flex';
}
function hideSignupModal() {
  document.getElementById('signup-overlay').style.display = 'none';
  document.getElementById('signup-alert').innerHTML = '';
  ['su-name','su-email','su-pw','su-dept','su-title','su-note']
    .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
}

async function doSignup() {
  const name  = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const pw    = document.getElementById('su-pw').value;
  const dept  = document.getElementById('su-dept').value.trim();
  const title = document.getElementById('su-title').value.trim();
  const note  = document.getElementById('su-note').value.trim();
  const alertEl = document.getElementById('signup-alert');

  if (!name || !email || !pw) {
    alertEl.innerHTML = '<div class="alert alert-red">이름, 이메일, 비밀번호는 필수입니다.</div>'; return;
  }
  if (pw.length < 8) {
    alertEl.innerHTML = '<div class="alert alert-red">비밀번호는 8자 이상이어야 합니다.</div>'; return;
  }
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: pw, dept, title, signup_note: note })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alertEl.innerHTML = '<div class="alert alert-green">가입 신청 완료! 관리자 승인 후 로그인 가능합니다.</div>';
    setTimeout(() => hideSignupModal(), 2500);
  } catch(e) {
    alertEl.innerHTML = `<div class="alert alert-red">${e.message}</div>`;
  }
}

async function doLogin() {
  const email   = document.getElementById('l-email').value.trim();
  const pw      = document.getElementById('l-pw').value;
  const alertEl = document.getElementById('login-alert');
  if (!email || !pw) {
    alertEl.innerHTML = '<div class="alert alert-red">이메일과 비밀번호를 입력하세요.</div>'; return;
  }
  try {
    await App.login(email, pw);
  } catch(e) {
    alertEl.innerHTML = `<div class="alert alert-red">${e.message}</div>`;
  }
}
```

---

### 1-3. public/js/pages/admin.js 수정

#### (A) Pages.admin 함수 교체
기존 Pages.admin 함수 전체를 아래로 교체해줘:

```javascript
Pages.admin = async function() {
  if (!App.isAdmin()) {
    document.getElementById('main-area').innerHTML =
      '<div class="alert alert-red">접근 권한이 없습니다.</div>';
    return;
  }
  let pendingCount = 0;
  try {
    const reqs = await API.get('/users/signup-requests');
    pendingCount = reqs.filter(r => r.account_status === 'pending').length;
  } catch(e) {}

  const area = document.getElementById('main-area');
  const pendingBadge = pendingCount > 0
    ? ` <span style="background:var(--red);color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:4px">${pendingCount}</span>`
    : '';
  area.innerHTML = `
    <div class="stabs">
      <button class="stb active" id="stb-adm-accounts" onclick="switchAdmTab('adm-accounts')">계정 승인 관리${pendingBadge}</button>
      <button class="stb"        id="stb-adm-cat"      onclick="switchAdmTab('adm-cat')">목표 카테고리</button>
      <button class="stb"        id="stb-adm-org"      onclick="switchAdmTab('adm-org')">조직도 관리</button>
      <button class="stb"        id="stb-adm-roles"    onclick="switchAdmTab('adm-roles')">권한 관리</button>
      <button class="stb"        id="stb-adm-audit"    onclick="switchAdmTab('adm-audit')">감사 로그</button>
    </div>
    <div class="sp active" id="adm-accounts"></div>
    <div class="sp"        id="adm-cat"></div>
    <div class="sp"        id="adm-org"></div>
    <div class="sp"        id="adm-roles"></div>
    <div class="sp"        id="adm-audit"></div>`;
  renderAdmAccounts();
};
```

#### (B) switchAdmTab 함수 교체
기존 switchAdmTab 전체를 아래로 교체해줘:

```javascript
function switchAdmTab(id) {
  document.querySelectorAll('.stb').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sp').forEach(s => s.classList.remove('active'));
  document.getElementById('stb-'+id)?.classList.add('active');
  document.getElementById(id)?.classList.add('active');
  if (id === 'adm-accounts') renderAdmAccounts();
  if (id === 'adm-cat')      renderAdmCat();
  if (id === 'adm-org')      renderAdmOrg();
  if (id === 'adm-roles')    renderAdmRoles();
  if (id === 'adm-audit')    renderAdmAudit();
}
```

#### (C) renderAdmCat 함수 바로 위에 아래 함수 전체를 새로 삽입해줘

```javascript
/* ── 계정 승인 관리 ── */
async function renderAdmAccounts() {
  const el = document.getElementById('adm-accounts');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const [signupReqs, allUsers] = await Promise.all([
      API.get('/users/signup-requests'),
      API.get('/users'),
    ]);
    const pending  = signupReqs.filter(r => r.account_status === 'pending');
    const rejected = signupReqs.filter(r => r.account_status === 'rejected');
    const active   = allUsers.filter(u => u.account_status === 'approved' || !u.account_status);

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-header-t">가입 신청 대기
              <span style="background:rgba(255,255,255,.25);padding:2px 8px;border-radius:10px;font-size:12px;margin-left:6px">${pending.length}건</span>
            </div>
            <div class="card-header-s">승인 시 부서·직책·상위관리자를 지정하면 승인 체계가 자동 설정됩니다</div>
          </div>
        </div>
        ${pending.length === 0
          ? '<div class="alert alert-orange">대기 중인 가입 신청이 없습니다.</div>'
          : pending.map(u => `
            <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px">
              <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">
                <div class="avatar" style="background:var(--o100);color:var(--o800);width:40px;height:40px;font-size:13px;flex-shrink:0">${u.name.slice(0,2)}</div>
                <div style="flex:1;min-width:160px">
                  <div style="font-weight:500;font-size:14px">${u.name}
                    <span style="font-size:12px;color:var(--muted);font-weight:400"> · ${u.dept||'부서미입력'} · ${u.title||'직책미입력'}</span>
                  </div>
                  <div style="font-size:12px;color:var(--muted);margin-top:2px">${u.email} · 신청일 ${(u.created_at||'').slice(0,10)}</div>
                  ${u.signup_note ? `<div style="font-size:12px;margin-top:6px;padding:6px 8px;background:var(--o50);border-radius:6px;color:var(--o800)">신청 사유: ${u.signup_note}</div>` : ''}
                </div>
              </div>
              <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
                <div style="font-size:12px;color:var(--o600);font-weight:500;margin-bottom:8px">승인 시 설정</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
                  <div style="flex:1;min-width:100px">
                    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">부서</label>
                    <input id="ap-dept-${u.id}" value="${u.dept||''}" style="height:32px;font-size:12px">
                  </div>
                  <div style="flex:1;min-width:100px">
                    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">직책</label>
                    <input id="ap-title-${u.id}" value="${u.title||''}" style="height:32px;font-size:12px">
                  </div>
                  <div style="flex:1;min-width:130px">
                    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">상위 관리자</label>
                    <select id="ap-mgr-${u.id}" style="height:32px;font-size:12px;width:100%">
                      <option value="">없음</option>
                      ${active.map(a => `<option value="${a.id}">${a.name} (${a.dept||''} ${a.title||''})</option>`).join('')}
                    </select>
                  </div>
                  <div style="flex:1;min-width:110px">
                    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">권한</label>
                    <select id="ap-role-${u.id}" style="height:32px;font-size:12px;width:100%">
                      <option value="user">일반사용자</option>
                      <option value="admin">일반관리자</option>
                      ${App.isMaster() ? '<option value="master">마스터관리자</option>' : ''}
                    </select>
                  </div>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                  <button class="btn btn-danger btn-sm" onclick="rejectAccount(${u.id})">거절</button>
                  <button class="btn btn-success btn-sm" onclick="approveAccount(${u.id})">승인</button>
                </div>
              </div>
            </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-header"><div>
          <div class="card-header-t">활성 계정 관리</div>
          <div class="card-header-s">비활성화 시 해당 계정은 즉시 로그인 차단됩니다</div>
        </div></div>
        <table class="tbl">
          <thead><tr><th>이름</th><th>이메일</th><th>부서 · 직책</th><th>권한</th><th>상태</th><th></th></tr></thead>
          <tbody>
            ${active.map(u => `<tr>
              <td style="font-weight:500">${u.name}</td>
              <td style="font-size:12px;color:var(--muted)">${u.email}</td>
              <td style="font-size:12px;color:var(--muted)">${u.dept||'-'} · ${u.title||'-'}</td>
              <td>${roleBadge(u.role)}</td>
              <td><span class="bd ${u.is_active ? 'bd-approved' : 'bd-rejected'}">${u.is_active ? '활성' : '비활성'}</span></td>
              <td>${String(u.id) !== String(App.user.id)
                ? `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="toggleActive(${u.id}, this)">${u.is_active ? '비활성화' : '활성화'}</button>`
                : '<span style="font-size:11px;color:var(--muted)">본인</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${rejected.length ? `
      <div class="card">
        <div style="font-size:13px;font-weight:500;margin-bottom:10px;color:var(--muted)">거절된 신청 (${rejected.length}건)</div>
        ${rejected.map(u => `
          <div class="user-row">
            <div class="avatar" style="background:var(--red-bg);color:var(--red)">${u.name.slice(0,2)}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500">${u.name}</div>
              <div style="font-size:12px;color:var(--muted)">${u.email} · ${u.dept||''} · 신청 ${(u.created_at||'').slice(0,10)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="reApproveAccount(${u.id})">재승인 처리</button>
          </div>`).join('')}
      </div>` : ''}`;
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">${e.message}</div>`;
  }
}

async function approveAccount(uid) {
  const dept  = document.getElementById('ap-dept-'+uid)?.value || '';
  const title = document.getElementById('ap-title-'+uid)?.value || '';
  const mgr   = document.getElementById('ap-mgr-'+uid)?.value || null;
  const role  = document.getElementById('ap-role-'+uid)?.value || 'user';
  try {
    await API.post(`/users/${uid}/approve`, { role, dept, title, manager_id: mgr });
    showAlert('계정이 승인되었습니다.', 'green');
    renderAdmAccounts();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function rejectAccount(uid) {
  if (!confirm('이 가입 신청을 거절하시겠습니까?')) return;
  try {
    await API.post(`/users/${uid}/reject`, {});
    showAlert('가입 신청이 거절되었습니다.', 'red');
    renderAdmAccounts();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function reApproveAccount(uid) {
  try {
    await API.post(`/users/${uid}/approve`, { role: 'user' });
    showAlert('계정이 재승인되었습니다.', 'green');
    renderAdmAccounts();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function toggleActive(uid, btn) {
  try {
    const res = await API.post(`/users/${uid}/toggle-active`, {});
    showAlert(res.is_active ? '계정이 활성화되었습니다.' : '계정이 비활성화되었습니다.', res.is_active ? 'green' : 'red');
    renderAdmAccounts();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 수정 2 — 목표 추가 시 카테고리 순서 유지

### public/js/pages/my-eval.js 수정

기존 renderCatBlock 함수 전체를 아래로 교체해줘:

```javascript
function renderCatBlock(cat, container) {
  const existing = document.getElementById('cat-'+cat.id);
  if (!_goals[cat.id]) _goals[cat.id] = [];
  const goals = _goals[cat.id];
  const tw = goals.reduce((a,g) => a + Number(g.weight), 0);
  const wtCls = tw === 100 ? 'wt-ok' : tw > 100 ? 'wt-err' : 'wt-warn';

  const block = document.createElement('div');
  block.className = 'cat-block';
  block.id = 'cat-'+cat.id;
  block.innerHTML = `
    <div class="cat-hd">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="cat-title" style="background:${cat.color};color:${cat.text_color}">${cat.name}</span>
        <span style="font-size:12px;color:var(--muted)">${cat.description} · 카테고리 ${cat.weight}%</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="${wtCls}" id="wt-${cat.id}">합계 ${tw}%</span>
        <button class="btn btn-ghost btn-sm" onclick="addGoalRow('${cat.id}')">+ 추가</button>
      </div>
    </div>
    <div id="gl-${cat.id}">${goals.map((g,i) => goalRowHtml(cat.id, i, g)).join('')}</div>`;

  if (existing) {
    // 기존 블록을 같은 자리에서 교체 → 카테고리 순서 유지
    container.replaceChild(block, existing);
  } else {
    // 최초 삽입 시 인사팀 sort_order 순서 유지
    const catIds = _cats.map(c => String(c.id));
    const myIdx  = catIds.indexOf(String(cat.id));
    let insertBefore = null;
    for (let i = myIdx + 1; i < catIds.length; i++) {
      const nextEl = document.getElementById('cat-' + catIds[i]);
      if (nextEl) { insertBefore = nextEl; break; }
    }
    if (insertBefore) container.insertBefore(block, insertBefore);
    else              container.appendChild(block);
  }
}
```

---

## 수정 3 — '목표 설정 배경 및 의견' textarea UI 수정

### public/js/pages/my-eval.js 수정

renderGoalSetForm 함수 안의 "Self reason" 카드 부분을 찾아서 아래로 교체해줘.

찾을 코드 (정확히 이 부분):
```javascript
  // Self reason
  const reason = html(`<div class="card">
    <label class="form-group"><span style="font-size:12px;color:var(--o600);font-weight:500">목표 설정 배경 및 의견</span>
    <textarea id="ev-reason" placeholder="목표 설정 이유와 기대 성과를 작성하세요...">${ev?.self_reason||''}</textarea></label>
  </div>`);
```

교체할 코드:
```javascript
  // Self reason
  const reason = html(`<div class="card">
    <div style="font-size:12px;color:var(--o600);font-weight:500;margin-bottom:8px">목표 설정 배경 및 의견</div>
    <textarea id="ev-reason" placeholder="목표 설정 이유와 기대 성과를 작성하세요..."
      style="width:100%;min-height:100px;resize:vertical;display:block">${ev?.self_reason||''}</textarea>
  </div>`);
```

---

## 수정 4 — 임시저장 500 오류 수정

### 원인
saveDraftGoals()가 saveOrCreateEval()을 호출하는데, saveOrCreateEval() 내부에서
POST /api/evals를 호출할 때 period_label 계산에 필요한 `ev-year` 셀렉트 DOM이
이미 렌더링되어 있지 않거나, _subP 초기값이 설정되기 전에 호출되어 오류 발생.

### public/js/pages/my-eval.js 수정

#### (A) saveOrCreateEval 함수 전체를 아래로 교체:

```javascript
async function saveOrCreateEval() {
  const evs = await API.get('/evals');
  let ev = evs.find(e => String(e.user_id) === String(App.user.id)
                      && ['draft','pending'].includes(e.phase));
  if (!ev) {
    // DOM이 없을 경우 안전한 기본값 사용
    const yearEl = document.getElementById('ev-year');
    const year   = yearEl ? yearEl.value : '2025년';
    const period = _period || 'q';
    const subP   = _subP   || '1';
    const label  = getPeriodLabel(period, subP, year);
    const data   = await API.post('/evals', {
      period_type:  period,
      period_label: label,
      eval_year:    year,
    });
    ev = { id: data.id };
  }
  return ev;
}
```

#### (B) saveDraftGoals 함수 전체를 아래로 교체:

```javascript
async function saveDraftGoals() {
  try {
    const ev = await saveOrCreateEval();
    const goals = Object.entries(_goals).flatMap(([catId, gs]) =>
      gs.map(g => ({ category_id: catId, name: g.name||'', kpi: g.kpi||'', weight: g.weight||0 }))
    );
    const reasonEl = document.getElementById('ev-reason');
    const reason   = reasonEl ? reasonEl.value : '';
    await API.post(`/evals/${ev.id}/goals`, { goals, self_reason: reason });
    showAlert('임시저장 완료!', 'green');
  } catch(e) {
    console.error('saveDraftGoals error:', e);
    showAlert('임시저장 실패: ' + e.message, 'red');
  }
}
```

---

## 수정 5 — 기존 DB에 새 컬럼 자동 추가 (마이그레이션)

### server/index.js 수정

initDB() 함수 맨 끝, `seedInitialData();` 호출 바로 위에 아래 코드를 추가해줘:

```javascript
  // 기존 DB에 새 컬럼이 없을 경우 자동 추가 (마이그레이션)
  try {
    db.prepare("ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'approved'").run();
  } catch(e) { /* 이미 존재하면 무시 */ }
  try {
    db.prepare("ALTER TABLE users ADD COLUMN signup_note TEXT").run();
  } catch(e) { /* 이미 존재하면 무시 */ }
  // 기존 사용자 account_status 초기화
  db.prepare("UPDATE users SET account_status='approved' WHERE account_status IS NULL").run();
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

아래 내용을 CLAUDE.md에 반영해줘:

1. "알려진 버그" 섹션에서 아래 항목을 [x]로 체크:
   - `pages/my-eval.js` — `cancelApproval()` 관련 항목 (이번에 수정하지 않으면 그대로)
   - 임시저장 500 오류 (새로 추가 후 [x] 처리)

2. "미완성 기능" 섹션에서 아래 항목 [x] 처리:
   - 비밀번호 변경 기능 (미수정이면 그대로)

3. "알려진 버그"에 아래 항목 새로 추가:
   - [ ] `pages/my-eval.js` — `cancelApproval()` 함수가 UI만 변경하고 DB phase를 draft로 변경하지 않음 (미수정)

4. "미완성 기능"에서 아래 항목 [x] 처리:
   - 신규 가입 신청 및 계정 승인 관리 기능

5. "API 엔드포인트 목록"에 아래 추가:
   ```
   POST   /api/auth/signup                 가입 신청 (인증 불필요)
   GET    /api/users/signup-requests       가입 신청 목록 (admin+)
   POST   /api/users/:id/approve           가입 승인 (admin+)
   POST   /api/users/:id/reject            가입 거절 (admin+)
   POST   /api/users/:id/toggle-active     계정 활성/비활성 토글 (admin+)
   ```

6. "개발 이력" 테이블에 아래 행 추가:
   ```
   | 2025-04-30 | 신규가입신청/계정승인, 카테고리순서유지, textarea UI, 임시저장500오류 수정 | Claude Code |
   ```
