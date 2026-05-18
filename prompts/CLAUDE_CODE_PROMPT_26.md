# Claude Code 작업 지시서 26
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_26.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]
[작업 완료 후 git push 하지 말 것]

---

## 작업 목표: 조직 명시적 정의 (organizations 테이블 신규)

### 핵심 설계
```
organizations 테이블로 조직을 명시적으로 정의
  - 계층구조 (parent_id)
  - 조직장 (leader_id, nullable - 미지정 가능)
  - leader_id = null 시 parent 조직의 leader에게 자동 위임

users.org_id 추가:
  - 소속 조직 지정
  - dept 필드는 하위 호환성을 위해 유지

평가방식 조회:
  - manager_id 체인 대신 org_id 기반으로 변경
  - 조직장의 eval_period_modes 조회
```

### 초기 테스트 데이터
```
㈜사이냅소프트 (leader: 이대표/id=1, parent: null)
  └─ 인사팀 (leader: 김인사/id=2, parent: 사이냅소프트)
  └─ 개발팀 (leader: 최개발/id=4, parent: 사이냅소프트)
  └─ 영업팀 (leader: 오영업/id=7, parent: 사이냅소프트)

users org_id 매핑:
  이대표(1)  → 사이냅소프트
  김인사(2)  → 인사팀
  박인사(3)  → 인사팀
  최개발(4)  → 개발팀
  정개발(5)  → 개발팀
  한개발(6)  → 개발팀
  오영업(7)  → 영업팀
```

---

## 작업 1 — server/index.js: DB 추가

### 1-1. migrations에 추가

```javascript
`CREATE TABLE IF NOT EXISTS organizations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  leader_id   INTEGER,
  parent_id   INTEGER,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
)`,
"ALTER TABLE users ADD COLUMN org_id INTEGER",
```

### 1-2. 초기 데이터 시드 (initDB 함수 안, migrations 실행 후)

```javascript
// organizations 초기 데이터
const orgCount = db.prepare('SELECT COUNT(*) as c FROM organizations').get();
if (orgCount.c === 0) {
  // 최상위 조직
  const rootOrg = db.prepare(
    "INSERT INTO organizations(name, leader_id, parent_id, sort_order) VALUES(?,?,?,?)"
  ).run('㈜사이냅소프트', 1, null, 0);
  const rootId = rootOrg.lastInsertRowid;

  // 하위 조직
  const hrOrg  = db.prepare(
    "INSERT INTO organizations(name, leader_id, parent_id, sort_order) VALUES(?,?,?,?)"
  ).run('인사팀', 2, rootId, 1);
  const devOrg = db.prepare(
    "INSERT INTO organizations(name, leader_id, parent_id, sort_order) VALUES(?,?,?,?)"
  ).run('개발팀', 4, rootId, 2);
  const salesOrg = db.prepare(
    "INSERT INTO organizations(name, leader_id, parent_id, sort_order) VALUES(?,?,?,?)"
  ).run('영업팀', 7, rootId, 3);

  // users org_id 매핑
  const orgMap = [
    [1, rootId],   // 이대표 → 사이냅소프트
    [2, hrOrg.lastInsertRowid],    // 김인사 → 인사팀
    [3, hrOrg.lastInsertRowid],    // 박인사 → 인사팀
    [4, devOrg.lastInsertRowid],   // 최개발 → 개발팀
    [5, devOrg.lastInsertRowid],   // 정개발 → 개발팀
    [6, devOrg.lastInsertRowid],   // 한개발 → 개발팀
    [7, salesOrg.lastInsertRowid], // 오영업 → 영업팀
  ];
  orgMap.forEach(([userId, orgId]) => {
    db.prepare('UPDATE users SET org_id=? WHERE id=?').run(orgId, userId);
  });
  console.log('[DB] organizations 초기 데이터 생성 완료');
}
```

### 1-3. organizations CRUD API 추가

```javascript
// ── 조직 관리 API ─────────────────────────────────────────

// 조직 목록 (계층 포함)
app.get('/api/organizations', auth, (req, res) => {
  try {
    const orgs = db.prepare(`
      SELECT o.*,
        u.name as leader_name, u.title as leader_title,
        p.name as parent_name
      FROM organizations o
      LEFT JOIN users u ON o.leader_id = u.id
      LEFT JOIN organizations p ON o.parent_id = p.id
      WHERE o.is_active = 1
      ORDER BY o.sort_order, o.id
    `).all();
    res.json(orgs);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직 추가
app.post('/api/organizations', auth, adminOnly, (req, res) => {
  try {
    const { name, leader_id, parent_id, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: '조직명은 필수입니다.' });
    const r = db.prepare(
      "INSERT INTO organizations(name,leader_id,parent_id,description,sort_order) VALUES(?,?,?,?,?)"
    ).run(name, leader_id||null, parent_id||null, description||'', sort_order||0);
    auditLog(req.user.sub, 'ORG_CREATED', r.lastInsertRowid, name, `조직 생성: ${name}`, req.ip);
    res.json({ id: r.lastInsertRowid });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직 수정
app.put('/api/organizations/:id', auth, adminOnly, (req, res) => {
  try {
    const { name, leader_id, parent_id, description, sort_order } = req.body;
    db.prepare(
      "UPDATE organizations SET name=?,leader_id=?,parent_id=?,description=?,sort_order=? WHERE id=?"
    ).run(name, leader_id||null, parent_id||null, description||'', sort_order||0, req.params.id);
    auditLog(req.user.sub, 'ORG_UPDATED', req.params.id, name, `조직 수정: ${name}`, req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직 삭제 (비활성화)
app.delete('/api/organizations/:id', auth, masterOnly, (req, res) => {
  try {
    const org = db.prepare('SELECT name FROM organizations WHERE id=?').get(req.params.id);
    db.prepare('UPDATE organizations SET is_active=0 WHERE id=?').run(req.params.id);
    auditLog(req.user.sub, 'ORG_DELETED', req.params.id, org?.name, `조직 비활성화`, req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직 멤버 조회
app.get('/api/organizations/:id/members', auth, (req, res) => {
  try {
    const members = db.prepare(
      'SELECT id, name, title, grade, dept, role FROM users WHERE org_id=? AND is_active=1'
    ).all(req.params.id);
    res.json(members);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 사용자 조직 변경 (admin+)
app.patch('/api/users/:id/org', auth, adminOnly, (req, res) => {
  try {
    const { org_id } = req.body;
    db.prepare('UPDATE users SET org_id=? WHERE id=?').run(org_id||null, req.params.id);
    const target = db.prepare('SELECT name FROM users WHERE id=?').get(req.params.id);
    const org = org_id ? db.prepare('SELECT name FROM organizations WHERE id=?').get(org_id) : null;
    auditLog(req.user.sub, 'USER_ORG_CHANGED', req.params.id, target?.name,
      `조직 변경: ${org?.name||'미지정'}`, req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

### 1-4. 평가방식 조회 API 수정 (org_id 기반)

GET /api/settings/my-eval-mode 와
GET /api/eval-periods/my-modes 두 API에서
계층 탐색 로직을 org_id 기반으로 수정:

```javascript
// 공통 헬퍼 함수 추가 (API 라우트 위에)
function getMyOrgLeaderChain(userId) {
  // 내 소속 조직에서 리더 체인 찾기
  const me = db.prepare('SELECT org_id FROM users WHERE id=?').get(userId);
  if (!me?.org_id) return [];

  const chain = [];
  let currentOrgId = me.org_id;

  for (let depth = 0; depth < 10; depth++) {
    const org = db.prepare('SELECT * FROM organizations WHERE id=?').get(currentOrgId);
    if (!org) break;

    if (org.leader_id) chain.push(org.leader_id);

    if (!org.parent_id) break;
    currentOrgId = org.parent_id;
  }
  return chain; // [직속 조직장, 상위 조직장, ...]
}

// GET /api/settings/my-eval-mode 수정
// 기존 5단계 manager_id 탐색 부분을 아래로 교체:

const leaderChain = getMyOrgLeaderChain(req.user.sub);

if (activePeriod && leaderChain.length > 0) {
  for (const leaderId of leaderChain) {
    const orgMode = db.prepare(
      'SELECT eval_mode FROM eval_period_modes WHERE period_id=? AND manager_id=?'
    ).get(activePeriod.id, leaderId);
    if (orgMode) {
      return res.json({
        mode: orgMode.eval_mode,
        source: 'org_period',
        period: activePeriod.period_label
      });
    }
  }
  // 기간 전사 기본값
  if (activePeriod.eval_mode)
    return res.json({ mode: activePeriod.eval_mode, source: 'period',
      period: activePeriod.period_label });
}

// GET /api/eval-periods/my-modes 도 동일하게 수정
```

---

## 작업 2 — admin.js: 조직 관리 탭 추가

### 2-1. 조직 관리 탭 버튼 추가

관리자 탭 목록에 '조직 관리' 탭 추가:
```javascript
<button class="adm-tab" data-tab="adm-org" onclick="switchTab('adm-org')">조직 관리</button>
```

### 2-2. renderAdmOrg 함수 수정

기존 renderAdmOrg (조직도 차트) 함수는 유지하고
새로운 탭 'adm-org'에 조직 명시적 관리 UI 추가:

```javascript
async function renderAdmOrgTable() {
  const container = document.getElementById('adm-org-content');
  if (!container) return;

  const [orgs, users] = await Promise.all([
    API.get('/organizations'),
    API.get('/users'),
  ]);

  // 계층 구조로 렌더링
  const rootOrgs = orgs.filter(o => !o.parent_id);

  function renderOrgTree(org, depth = 0) {
    const children = orgs.filter(o => o.parent_id === org.id);
    const members = users.filter(u => u.org_id === org.id);
    const indent = depth * 20;

    return `
      <div style="margin-left:${indent}px;margin-bottom:8px;
                  border:1px solid var(--border);border-radius:8px;padding:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <span style="font-size:14px;font-weight:600;color:var(--o800)">${org.name}</span>
            ${org.leader_name
              ? `<span style="font-size:12px;color:var(--muted);margin-left:8px">
                   리더: ${org.leader_name} ${org.leader_title||''}</span>`
              : `<span style="font-size:12px;color:#E53935;margin-left:8px">리더 미지정</span>`}
            <span style="font-size:11px;color:var(--muted);margin-left:8px">
              멤버 ${members.length}명</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm"
              onclick="editOrg(${org.id}, '${org.name}', ${org.leader_id||'null'}, ${org.parent_id||'null'})">
              편집
            </button>
            <button class="btn btn-sm" style="font-size:11px;border:1px solid #F09595;color:#A32D2D"
              onclick="deleteOrg(${org.id}, '${org.name}')">
              삭제
            </button>
          </div>
        </div>

        <!-- 멤버 목록 -->
        ${members.length ? `
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">
          ${members.map(m => `
            <span style="font-size:11px;background:var(--o50);padding:2px 8px;
                          border-radius:12px;color:var(--o700)">
              ${m.name} ${m.title||''}
              <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px"
                onclick="removeFromOrg(${m.id}, '${m.name}')">✕</button>
            </span>`).join('')}
        </div>` : ''}

        <!-- 하위 조직 -->
        ${children.map(child => renderOrgTree(child, depth + 1)).join('')}
      </div>`;
  }

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:15px;font-weight:600">조직 구조 관리</div>
      <button class="btn btn-primary btn-sm" onclick="showAddOrgModal()">+ 조직 추가</button>
    </div>
    ${rootOrgs.map(org => renderOrgTree(org)).join('')}

    <!-- 미배정 직원 -->
    <div style="margin-top:16px">
      <div style="font-size:13px;font-weight:500;color:var(--muted);margin-bottom:8px">
        조직 미배정 직원
      </div>
      ${users.filter(u => !u.org_id && u.is_active).map(u => `
        <span style="font-size:12px;background:var(--o50);padding:3px 10px;
                      border-radius:12px;margin:3px;display:inline-block">
          ${u.name} ${u.title||''}
          <button class="btn btn-sm" style="font-size:10px;margin-left:4px"
            onclick="assignOrgModal(${u.id}, '${u.name}')">조직 배정</button>
        </span>`).join('') || '<span style="font-size:12px;color:var(--muted)">없음</span>'}
    </div>`;
}
```

### 2-3. 조직 추가/편집/삭제/배정 함수 추가

```javascript
function showAddOrgModal(parentId) {
  // 조직 추가 모달
  showOrgModal({ id: null, name: '', leader_id: null, parent_id: parentId||null });
}

async function editOrg(id, name, leaderId, parentId) {
  showOrgModal({ id, name, leader_id: leaderId, parent_id: parentId });
}

async function showOrgModal(org) {
  document.getElementById('org-modal')?.remove();
  const users = await API.get('/users');
  const orgs  = await API.get('/organizations');
  const overlay = document.createElement('div');
  overlay.id = 'org-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:12px;padding:24px;width:100%;max-width:400px;margin:20px">
      <div style="font-size:15px;font-weight:600;margin-bottom:16px">
        ${org.id ? '조직 편집' : '조직 추가'}
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">조직명 *</label>
        <input id="org-modal-name" value="${org.name||''}" placeholder="조직명 입력"
          style="width:100%;height:36px;font-size:13px">
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">상위 조직</label>
        <select id="org-modal-parent" style="width:100%;height:36px;font-size:13px">
          <option value="">최상위 (없음)</option>
          ${orgs.filter(o => o.id !== org.id).map(o =>
            `<option value="${o.id}" ${o.id===org.parent_id?'selected':''}>${o.name}</option>`
          ).join('')}
        </select>
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">조직장 (선택사항)</label>
        <select id="org-modal-leader" style="width:100%;height:36px;font-size:13px">
          <option value="">미지정</option>
          ${users.filter(u=>u.is_active).map(u =>
            `<option value="${u.id}" ${u.id===org.leader_id?'selected':''}>${u.name} ${u.title||''}</option>`
          ).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('org-modal').remove()">취소</button>
        <button class="btn btn-primary" onclick="saveOrg(${org.id||'null'})">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function saveOrg(orgId) {
  const name      = document.getElementById('org-modal-name')?.value.trim();
  const parent_id = document.getElementById('org-modal-parent')?.value || null;
  const leader_id = document.getElementById('org-modal-leader')?.value || null;
  if (!name) { showAlert('조직명을 입력해주세요.', 'orange'); return; }
  try {
    if (orgId) {
      await API.put('/organizations/' + orgId, { name, leader_id, parent_id });
    } else {
      await API.post('/organizations', { name, leader_id, parent_id });
    }
    showAlert('저장되었습니다.', 'green');
    document.getElementById('org-modal')?.remove();
    renderAdmOrgTable();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function deleteOrg(id, name) {
  if (!confirm(`"${name}" 조직을 삭제하시겠습니까?`)) return;
  try {
    await API.del('/organizations/' + id);
    showAlert('삭제되었습니다.', 'green');
    renderAdmOrgTable();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function assignOrgModal(userId, userName) {
  const orgs = await API.get('/organizations');
  document.getElementById('assign-org-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'assign-org-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:12px;padding:24px;width:100%;max-width:360px;margin:20px">
      <div style="font-size:15px;font-weight:600;margin-bottom:16px">${userName} 조직 배정</div>
      <select id="assign-org-select" style="width:100%;height:38px;font-size:13px;margin-bottom:16px">
        <option value="">조직 선택</option>
        ${orgs.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('assign-org-modal').remove()">취소</button>
        <button class="btn btn-primary" onclick="assignOrg(${userId})">배정</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function assignOrg(userId) {
  const orgId = document.getElementById('assign-org-select')?.value;
  if (!orgId) { showAlert('조직을 선택해주세요.', 'orange'); return; }
  try {
    await API.patch('/users/' + userId + '/org', { org_id: parseInt(orgId) });
    showAlert('조직이 배정되었습니다.', 'green');
    document.getElementById('assign-org-modal')?.remove();
    renderAdmOrgTable();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function removeFromOrg(userId, userName) {
  if (!confirm(`${userName}을(를) 조직에서 제외하시겠습니까?`)) return;
  try {
    await API.patch('/users/' + userId + '/org', { org_id: null });
    showAlert('조직에서 제외되었습니다.', 'green');
    renderAdmOrgTable();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

### 2-4. switchTab 함수에 adm-org 케이스 추가

```javascript
case 'adm-org': renderAdmOrgTable(); break;
```

---

## 작업 3 — 평가기간 관리 탭: 조직장 대신 조직명으로 표시

### loadOrgModes 함수 수정

현재 manager(조직장) 기준으로 표시되는 것을
조직명으로 표시되도록 수정:

```javascript
// GET /api/eval-periods/:id/org-modes 수정
// 기존: manager_id 기준
// 수정: organizations 기준으로 표시

app.get('/api/eval-periods/:id/org-modes', auth, adminOnly, (req, res) => {
  try {
    const orgs = db.prepare(`
      SELECT o.id as org_id, o.name as org_name,
        o.leader_id, u.name as leader_name,
        COALESCE(epm.eval_mode, ep.eval_mode, 'MBO') as eval_mode,
        epm.locked as org_locked
      FROM organizations o
      LEFT JOIN users u ON o.leader_id = u.id
      LEFT JOIN eval_period_modes epm ON epm.manager_id=o.leader_id AND epm.period_id=?
      LEFT JOIN eval_periods ep ON ep.id=?
      WHERE o.is_active=1 AND o.leader_id IS NOT NULL
      ORDER BY o.sort_order, o.id
    `).all(req.params.id, req.params.id);
    res.json(orgs);
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

loadOrgModes 함수(admin.js)에서 표시 방식 수정:
```javascript
// 기존: mgr.name + mgr.title
// 수정: org_name + leader_name
`<div style="min-width:140px">
  <span style="font-size:12px;font-weight:600">${mgr.org_name}</span>
  <span style="font-size:11px;color:var(--muted);margin-left:4px">
    리더: ${mgr.leader_name||'미지정'}
  </span>
</div>`
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | organizations 테이블 추가 (계층구조, 조직장, 멤버), org_id 기반 평가방식 조회 | Claude Code |
```

### DB 스키마에 추가:
```
organizations: id, name, leader_id, parent_id, description, sort_order, is_active
users:         ... org_id INTEGER (추가)
```

### API 목록에 추가:
```
GET    /api/organizations            조직 목록 (계층 포함)
POST   /api/organizations            조직 추가 (admin+)
PUT    /api/organizations/:id        조직 수정 (admin+)
DELETE /api/organizations/:id        조직 삭제 (master)
GET    /api/organizations/:id/members 조직 멤버 조회
PATCH  /api/users/:id/org            사용자 조직 변경 (admin+)
```

### 핵심 설계 원칙에 추가:
```
- 조직 구조: organizations 테이블 (계층구조)
  leader_id = null 허용 (미지정 시 parent 조직장에게 자동 위임)
  users.org_id → 소속 조직 지정
  평가방식 조회: org_id 기반 조직장 체인 탐색
  관리: 관리자 설정 → 조직 관리 탭
```
