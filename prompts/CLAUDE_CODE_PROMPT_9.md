# Claude Code 작업 지시서 9
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 1 — 승인 관리 탭: 기간별 이력 조회 + 수정/취소 기능

### 1-1. server/index.js — 관련 API 추가

GET /api/admin/audit 라우트 위에 추가:

```javascript
// 승인 수정/취소 허용 설정 조회
app.get('/api/settings/approval-edit', auth, (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='approval_edit'").get();
    res.json({ enabled: row ? row.value === '1' : false });
  } catch(e) { res.json({ enabled: false }); }
});

app.post('/api/settings/approval-edit', auth, adminOnly, (req, res) => {
  try {
    const val = req.body.enabled ? '1' : '0';
    const exists = db.prepare("SELECT 1 FROM app_settings WHERE key='approval_edit'").get();
    if (exists) db.prepare("UPDATE app_settings SET value=? WHERE key='approval_edit'").run(val);
    else db.prepare("INSERT INTO app_settings(key,value) VALUES(?,?)").run('approval_edit', val);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 내가 승인한 이력 목록 (기간 필터 지원)
app.get('/api/approvals/my-history', auth, (req, res) => {
  try {
    const { period_label, eval_year } = req.query;
    let sql = `SELECT a.*, e.user_id, e.period_label, e.eval_year, e.phase,
               u.name as target_name, u.dept as target_dept, u.title as target_title
               FROM goal_approvals a
               JOIN eval_cycles e ON a.eval_id = e.id
               JOIN users u ON e.user_id = u.id
               WHERE a.approver_id = ?`;
    const params = [req.user.sub];
    if (period_label) { sql += ' AND e.period_label=?'; params.push(period_label); }
    if (eval_year)    { sql += ' AND e.eval_year=?';    params.push(eval_year); }
    sql += ' ORDER BY a.created_at DESC';
    const rows = db.prepare(sql).all(...params).map(r => ({
      ...r,
      note: r.note ? decrypt(r.note) : '',
    }));
    res.json(rows);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 승인 취소 (설정에서 허용된 경우만)
app.delete('/api/approvals/:approvalId', auth, (req, res) => {
  try {
    // 허용 설정 확인
    const setting = db.prepare("SELECT value FROM app_settings WHERE key='approval_edit'").get();
    if (!setting || setting.value !== '1')
      return res.status(403).json({ error: '승인 취소가 허용되지 않은 상태입니다. 관리자에게 문의하세요.' });

    const appr = db.prepare('SELECT * FROM goal_approvals WHERE id=?').get(req.params.approvalId);
    if (!appr) return res.status(404).json({ error: '승인 이력 없음' });
    if (String(appr.approver_id) !== String(req.user.sub) && !['master','admin'].includes(req.user.role))
      return res.status(403).json({ error: '본인 승인만 취소 가능합니다.' });

    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(appr.eval_id);

    // 승인 레코드 삭제
    db.prepare('DELETE FROM goal_approvals WHERE id=?').run(req.params.approvalId);

    // eval phase를 pending으로 되돌림
    if (ev && ['approved','final_self','final_mgr_pending','final_done'].includes(ev.phase)) {
      // 최종 확정 후에는 master만 취소 가능
      if (!['master','admin'].includes(req.user.role))
        return res.status(403).json({ error: '목표 확정 후에는 관리자만 취소할 수 있습니다.' });
    }
    db.prepare("UPDATE eval_cycles SET phase='pending',approved_at=NULL,updated_at=datetime('now') WHERE id=?")
      .run(appr.eval_id);
    db.prepare("UPDATE goals SET status='pending' WHERE eval_id=?").run(appr.eval_id);

    const targetUser = db.prepare('SELECT name FROM users WHERE id=?').get(ev?.user_id);
    auditLog(req.user.sub, 'APPROVAL_CANCELLED', ev?.user_id, targetUser?.name,
      `${appr.level}차 승인 취소 (${ev?.period_label||''})`, req.ip);
    res.json({ success: true });
  } catch(err) {
    console.error('[cancel approval]', err);
    res.status(500).json({ error: err.message });
  }
});

// 승인 의견 수정 (설정에서 허용된 경우만)
app.patch('/api/approvals/:approvalId', auth, (req, res) => {
  try {
    const setting = db.prepare("SELECT value FROM app_settings WHERE key='approval_edit'").get();
    if (!setting || setting.value !== '1')
      return res.status(403).json({ error: '승인 수정이 허용되지 않은 상태입니다.' });

    const appr = db.prepare('SELECT * FROM goal_approvals WHERE id=?').get(req.params.approvalId);
    if (!appr) return res.status(404).json({ error: '없음' });
    if (String(appr.approver_id) !== String(req.user.sub) && !['master','admin'].includes(req.user.role))
      return res.status(403).json({ error: '본인 승인만 수정 가능합니다.' });

    const { note } = req.body;
    db.prepare('UPDATE goal_approvals SET note=? WHERE id=?').run(encrypt(note||''), req.params.approvalId);
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(appr.eval_id);
    auditLog(req.user.sub, 'APPROVAL_EDITED', ev?.user_id, null,
      `${appr.level}차 승인 의견 수정 (${ev?.period_label||''})`, req.ip);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

### 1-2. public/js/pages/approvals.js — 내 승인 이력 탭 추가

Pages.approvals 함수 내 stabs에 탭 추가:
```javascript
// 기존 탭들 뒤에 추가
<button class="stb" onclick="swSub('my-appr-hist','approval')">내 승인 이력</button>
// sp div 추가
<div class="sp" id="my-appr-hist"></div>
```

그리고 renderMyApprovalHistory 함수를 approvals.js에 추가:

```javascript
let _apprHistFilter = { label:'', year:'' };

async function renderMyApprovalHistory() {
  const el = document.getElementById('my-appr-hist'); if(!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const [periods, setting] = await Promise.all([
      API.get('/eval-periods'),
      API.get('/settings/approval-edit'),
    ]);
    const canEdit = setting.enabled;

    // 기간 필터 URL
    let url = '/approvals/my-history';
    const params = [];
    if (_apprHistFilter.label) params.push('period_label=' + encodeURIComponent(_apprHistFilter.label));
    if (_apprHistFilter.year)  params.push('eval_year='    + encodeURIComponent(_apprHistFilter.year));
    if (params.length) url += '?' + params.join('&');

    const history = await API.get(url);

    el.innerHTML = '';

    // 필터 UI
    const filterDiv = document.createElement('div');
    filterDiv.className = 'card';
    filterDiv.style.marginBottom = '10px';
    filterDiv.innerHTML = `
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:160px">
          <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">평가 기간</label>
          <select id="aphr-period" style="height:34px;font-size:13px;width:100%">
            <option value="">전체 기간</option>
            ${periods.map(p =>
              `<option value="${p.period_label}|${p.eval_year}"
                ${_apprHistFilter.label===p.period_label?'selected':''}>${p.period_label}</option>`
            ).join('')}
          </select>
        </div>
        <button class="btn btn-primary" style="height:34px" onclick="applyApprHistFilter()">조회</button>
        ${_apprHistFilter.label ? `<button class="btn btn-ghost" style="height:34px" onclick="_apprHistFilter={label:'',year:''};renderMyApprovalHistory()">초기화</button>` : ''}
      </div>
      ${!canEdit ? `<div class="alert alert-orange" style="font-size:12px;margin-top:10px">현재 승인 수정/취소가 비활성화 상태입니다. 관리자 설정에서 활성화할 수 있습니다.</div>` : ''}`;
    el.appendChild(filterDiv);

    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-orange';
      empty.textContent = '해당 기간에 승인 이력이 없습니다.';
      el.appendChild(empty);
      return;
    }

    // 승인 이력 목록
    const actionLabels = { approved:'승인', rejected:'반려' };
    const actionCls    = { approved:'bd-approved', rejected:'bd-rejected' };

    history.forEach(h => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '10px';
      card.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:14px;font-weight:600">${h.target_name}
              <span style="font-size:12px;color:var(--muted);font-weight:400"> · ${h.target_dept||''} · ${h.target_title||''}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">
              ${h.period_label||''} · ${h.level}차 ${actionLabels[h.action]||h.action} · ${(h.created_at||'').slice(0,16)}
            </div>
          </div>
          <span class="bd ${actionCls[h.action]||'bd-draft'}">${h.level}차 ${actionLabels[h.action]||h.action}</span>
        </div>
        <!-- 의견 표시 및 수정 -->
        <div style="margin-bottom:${canEdit?'10px':'0'}">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px">승인 의견</div>
          ${canEdit
            ? `<textarea id="aphr-note-${h.id}" style="width:100%;min-height:60px;resize:vertical">${h.note||''}</textarea>`
            : `<div style="font-size:13px;padding:8px;background:var(--o50);border-radius:6px;min-height:36px">${h.note||'(의견 없음)'}</div>`}
        </div>
        ${canEdit ? `
        <div class="abar">
          <button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;padding:5px 12px"
            onclick="cancelApproval(${h.id},'${h.target_name}',${h.level})">승인 취소</button>
          <button class="btn btn-ghost btn-sm"
            onclick="editApproval(${h.id})">의견 수정</button>
        </div>` : ''}`;
      el.appendChild(card);
    });
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

function applyApprHistFilter() {
  const sel = document.getElementById('aphr-period');
  const val = sel?.value || '';
  if (val) {
    const [label, year] = val.split('|');
    _apprHistFilter = { label, year: year||'' };
  } else {
    _apprHistFilter = { label:'', year:'' };
  }
  renderMyApprovalHistory();
}

async function cancelApproval(approvalId, targetName, level) {
  if (!confirm(`${targetName}의 ${level}차 승인을 취소하시겠습니까?\n취소 시 해당 평가가 승인 대기 상태로 돌아갑니다.`)) return;
  try {
    await API.del('/approvals/' + approvalId);
    showAlert('승인이 취소되었습니다.', 'red');
    renderMyApprovalHistory();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function editApproval(approvalId) {
  const noteEl = document.getElementById('aphr-note-' + approvalId);
  if (!noteEl) return;
  try {
    await API.patch('/approvals/' + approvalId, { note: noteEl.value });
    showAlert('승인 의견이 수정되었습니다.', 'green');
  } catch(e) { showAlert(e.message, 'red'); }
}
```

swSub 함수에서 'my-appr-hist' 탭 선택 시 renderMyApprovalHistory() 호출 추가:
```javascript
// swSub 함수 안에서 id === 'my-appr-hist' 일 때
if (id === 'my-appr-hist') renderMyApprovalHistory();
```

---

## 작업 2 — 조직도 차트: 중앙 정렬 + 스크롤 + 전체화면 + 저장 버튼

### 2-1. renderOrgChart 함수 전체 구조 개선

renderOrgChart 함수에서 캔버스 래퍼 HTML을 아래로 교체:

```javascript
el.innerHTML = `
  <div style="margin-bottom:10px;font-size:12px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap">
    <span>🔵 박스 드래그: 위치 재배치</span>
    <span>🟠 하단 점 드래그: 상위관리자 연결</span>
    <span>❌ 연결선 클릭: 연결 해제</span>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
    <button class="btn btn-ghost btn-sm" onclick="autoLayoutOrg()">자동 정렬</button>
    <button class="btn btn-ghost btn-sm" onclick="openOrgFullscreen()">전체화면 보기 🔲</button>
    <button class="btn btn-primary btn-sm" onclick="saveOrgLayout()" id="org-save-btn" style="display:none">
      💾 배치 저장
    </button>
    <span id="org-unsaved-badge" style="display:none;font-size:12px;color:var(--o600);align-self:center">
      ⚠ 미저장 변경사항 있음
    </span>
  </div>
  <div id="org-canvas-wrap" style="
    position:relative;
    width:100%;
    height:500px;
    overflow:auto;
    background:var(--bg);
    border:1px solid var(--border);
    border-radius:8px;">
    <div id="org-inner" style="position:relative;min-width:1200px;min-height:800px">
      <svg id="org-svg" style="position:absolute;top:0;left:0;pointer-events:none;z-index:1"></svg>
      <div id="org-nodes" style="position:absolute;top:0;left:0;z-index:2"></div>
    </div>
  </div>`;
```

### 2-2. initPositions 함수에서 중앙 정렬 로직 수정

기존 initPositions 함수를 아래로 교체:

```javascript
function initPositions(users) {
  const NODE_W = 130, NODE_H = 64, H_GAP = 40, V_GAP = 90;

  // 계층 레벨 계산
  function getLevel(uid, visited) {
    if (visited.has(uid)) return 0;
    visited.add(uid);
    const u = users.find(x => String(x.id) === String(uid));
    if (!u || !u.manager_id) return 0;
    return getLevel(u.manager_id, visited) + 1;
  }

  const levelMap = {};
  users.forEach(u => { levelMap[u.id] = getLevel(u.id, new Set()); });
  const maxLevel = Math.max(0, ...Object.values(levelMap));

  // 레벨별 그룹
  const byLevel = {};
  for (let l = 0; l <= maxLevel; l++) byLevel[l] = [];
  users.forEach(u => { (byLevel[levelMap[u.id]] = byLevel[levelMap[u.id]] || []).push(u); });

  // 전체 캔버스 너비 계산 (가장 넓은 레벨 기준)
  const maxCount = Math.max(...Object.values(byLevel).map(g => g.length));
  const totalW   = Math.max(1200, maxCount * (NODE_W + H_GAP) + 100);

  // 각 레벨을 캔버스 중앙 기준으로 배치
  for (let l = 0; l <= maxLevel; l++) {
    const group = byLevel[l] || [];
    const groupW = group.length * (NODE_W + H_GAP) - H_GAP;
    const startX = (totalW - groupW) / 2; // 중앙 정렬
    group.forEach((u, i) => {
      if (!window._orgPositions[u.id]) {
        window._orgPositions[u.id] = {
          x: startX + i * (NODE_W + H_GAP),
          y: 40 + l * (NODE_H + V_GAP),
        };
      }
    });
  }

  // inner div 크기 업데이트
  const inner = document.getElementById('org-inner');
  if (inner) {
    const maxY = Math.max(800, (maxLevel + 1) * (NODE_H + V_GAP) + 100);
    inner.style.minWidth  = totalW + 'px';
    inner.style.minHeight = maxY + 'px';
    const svg = document.getElementById('org-svg');
    if (svg) { svg.setAttribute('width', totalW); svg.setAttribute('height', maxY); }
  }
}
```

### 2-3. 위치 변경 시 "미저장" 표시, 저장 버튼 동작

마우스업(dragState 종료) 후에 미저장 표시:
```javascript
// dragState 종료 후
document.getElementById('org-save-btn')?.style && (document.getElementById('org-save-btn').style.display = '');
document.getElementById('org-unsaved-badge')?.style && (document.getElementById('org-unsaved-badge').style.display = 'flex');
```

saveOrgLayout 함수 추가:
```javascript
function saveOrgLayout() {
  // localStorage에 위치 저장 (재접속 시 유지)
  try {
    localStorage.setItem('org_positions', JSON.stringify(window._orgPositions));
    document.getElementById('org-save-btn').style.display = 'none';
    document.getElementById('org-unsaved-badge').style.display = 'none';
    showAlert('조직도 배치가 저장되었습니다.', 'green');
  } catch(e) {
    showAlert('저장 실패: ' + e.message, 'red');
  }
}
```

initPositions 시작 부분에서 localStorage 불러오기:
```javascript
// initPositions 맨 앞에 추가
try {
  const saved = localStorage.getItem('org_positions');
  if (saved) {
    const parsed = JSON.parse(saved);
    Object.assign(window._orgPositions, parsed);
  }
} catch(e) {}
```

### 2-4. 전체화면 팝업

openOrgFullscreen 함수 추가:
```javascript
function openOrgFullscreen() {
  const overlay = document.createElement('div');
  overlay.id = 'org-fullscreen';
  overlay.style.cssText = `
    position:fixed;top:0;left:0;width:100vw;height:100vh;
    background:rgba(0,0,0,.85);z-index:9999;
    display:flex;flex-direction:column;`;
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
      padding:12px 20px;background:var(--o400)">
      <span style="color:#fff;font-size:15px;font-weight:600">조직도 편집 — 전체화면</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none"
          onclick="autoLayoutOrg()">자동 정렬</button>
        <button class="btn btn-sm" style="background:#3B6D11;color:#fff;border:none"
          onclick="saveOrgLayout();closeOrgFullscreen()">저장 후 닫기</button>
        <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none"
          onclick="closeOrgFullscreen()">닫기</button>
      </div>
    </div>
    <div id="org-fs-wrap" style="flex:1;overflow:auto;background:var(--bg)">
      <div id="org-fs-inner" style="position:relative;min-width:2000px;min-height:1200px">
        <svg id="org-fs-svg" style="position:absolute;top:0;left:0;pointer-events:none;z-index:1;width:100%;height:100%"></svg>
        <div id="org-fs-nodes" style="position:absolute;top:0;left:0;z-index:2"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // 전체화면에서도 같은 조직도 렌더 (org-canvas-wrap 대신 org-fs-wrap 사용)
  // 기존 노드를 복제해서 전체화면에 배치
  renderOrgChartInContainer(
    window._orgUsers,
    document.getElementById('org-fs-wrap'),
    document.getElementById('org-fs-inner'),
    document.getElementById('org-fs-svg'),
    document.getElementById('org-fs-nodes'),
    true // isFullscreen
  );
}

function closeOrgFullscreen() {
  document.getElementById('org-fullscreen')?.remove();
  // 전체화면에서 변경된 위치를 메인 캔버스에 반영
  renderOrgChart(window._orgUsers);
}
```

---

## 작업 3 — 부서/직책 관리 및 조직 선택 필터

### 3-1. server/index.js — 부서/직책 수정 API 개선

기존 PATCH /api/users/:id 를 확인하고,
dept, title 수정이 포함되어 있으면 그대로 유지.
없다면 아래 추가:

```javascript
// 사용자 정보 수정 (admin+) — 부서/직책/상위관리자/권한 포함
app.patch('/api/users/:id', auth, adminOnly, (req, res) => {
  try {
    const { role, dept, title, manager_id, is_active } = req.body;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!u) return res.status(404).json({ error: '없음' });

    db.prepare(`UPDATE users SET
      role       = COALESCE(?, role),
      dept       = COALESCE(?, dept),
      title      = COALESCE(?, title),
      manager_id = ?,
      is_active  = COALESCE(?, is_active)
      WHERE id=?`
    ).run(
      role       ?? null,
      dept       ?? null,
      title      ?? null,
      manager_id !== undefined ? (manager_id || null) : u.manager_id,
      is_active  ?? null,
      req.params.id
    );

    auditLog(req.user.sub, 'USER_UPDATED', req.params.id, u.name,
      `사용자 정보 수정 (dept:${dept||'-'}, title:${title||'-'})`, req.ip);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

### 3-2. 조직도 관리 탭에 부서/직책 편집 추가

renderOrgList 함수에서 각 노드에 부서/직책 편집 필드 추가:

```javascript
// 기존 nodeHtml 함수에서 select 옆에 편집 버튼 추가
const editBtns = `
  <button class="btn btn-ghost btn-sm" style="font-size:11px"
    onclick="showUserEditModal(${u.id},'${u.name}','${u.dept||''}','${u.title||''}')">
    ✏ 정보 수정
  </button>`;
```

showUserEditModal 함수 추가:
```javascript
function showUserEditModal(uid, name, dept, title) {
  const overlay = document.createElement('div');
  overlay.id = 'user-edit-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:12px;padding:24px;width:100%;max-width:380px;margin:20px">
      <div style="font-size:15px;font-weight:600;margin-bottom:16px">${name} 정보 수정</div>
      <div class="form-group" style="margin-bottom:10px">
        <label>부서</label>
        <input id="ue-dept" value="${dept}" placeholder="예: 개발팀, 마케팅본부">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>직책</label>
        <input id="ue-title" value="${title}" placeholder="예: 팀장, 시니어개발자">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('user-edit-modal').remove()">취소</button>
        <button class="btn btn-primary" onclick="saveUserInfo(${uid})">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function saveUserInfo(uid) {
  const dept  = document.getElementById('ue-dept')?.value  || '';
  const title = document.getElementById('ue-title')?.value || '';
  try {
    await API.patch('/users/' + uid, { dept, title });
    showAlert('정보가 수정되었습니다.', 'green');
    document.getElementById('user-edit-modal')?.remove();
    renderAdmOrg();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

### 3-3. 전직원 평가 현황 — 조직(부서) 필터 추가

renderAdmStatus 함수의 filterCard에 조직 필터 추가:

```javascript
// 부서 목록 추출 (실제 users 데이터에서)
const depts = [...new Set(data.map(u => u.dept).filter(Boolean))].sort();

// filterCard innerHTML에 조직 필터 셀렉트 추가
`<div style="flex:1;min-width:130px">
  <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">조직(부서)</label>
  <select id="status-dept-filter" style="height:34px;font-size:13px;width:100%">
    <option value="">전체 조직</option>
    ${depts.map(d => `<option value="${d}" ${_statusDeptFilter===d?'selected':''}>${d}</option>`).join('')}
  </select>
</div>`
```

전역 변수 추가:
```javascript
let _statusDeptFilter = '';
```

applyStatusFilter 함수에서 부서 필터 적용:
```javascript
_statusDeptFilter = document.getElementById('status-dept-filter')?.value || '';
```

renderAdmStatus에서 byDept 구성 시 필터 적용:
```javascript
// 부서 필터가 있으면 해당 부서만
let filteredData = data;
if (_statusDeptFilter) {
  filteredData = data.filter(u => u.dept === _statusDeptFilter);
}
// 이후 filteredData로 byDept 구성
```

clearStatusFilter에 추가:
```javascript
_statusDeptFilter = '';
```

---

## 작업 4 — 평가 정책에 승인 수정/취소 설정 추가 (admin.js)

renderAdmPolicy 함수 안의 카드 HTML에 아래 설정 행 추가:

```javascript
// 기존 srow들 사이에 추가
<div class="srow">
  <div>
    <div style="font-size:14px;font-weight:500">승인자 승인 수정/취소 허용</div>
    <div style="font-size:12px;color:var(--muted)">켜짐: 승인자가 본인의 승인을 수정·취소 가능 · 꺼짐: 수정 불가</div>
  </div>
  <div style="display:flex;align-items:center;gap:8px">
    <span id="appr-edit-status" class="bd ${apprEdit.enabled?'bd-approved':'bd-rejected'}">${apprEdit.enabled?'켜짐':'꺼짐'}</span>
    <button class="btn btn-ghost btn-sm" onclick="toggleApprEdit()">${apprEdit.enabled?'끄기':'켜기'}</button>
  </div>
</div>
```

renderAdmPolicy에서 apprEdit 로드 추가:
```javascript
const [histVis, histInactive, fbLimit, apprEdit] = await Promise.all([
  API.get('/settings/history-visibility'),
  API.get('/settings/history-inactive'),
  API.get('/settings/feedback-limit'),
  API.get('/settings/approval-edit'),
]);
```

toggleApprEdit 함수 추가:
```javascript
async function toggleApprEdit() {
  try {
    const cur = await API.get('/settings/approval-edit');
    await API.post('/settings/approval-edit', { enabled: !cur.enabled });
    showAlert(!cur.enabled ? '승인 수정/취소가 허용되었습니다.' : '승인 수정/취소가 비활성화되었습니다.', !cur.enabled ? 'green' : 'red');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

1. "개발 이력"에 추가:
```
| 오늘날짜 | 승인이력조회/수정/취소, 조직도중앙정렬/스크롤/전체화면/저장, 부서직책편집, 전직원현황조직필터, 승인편집정책 | Claude Code |
```

2. "API 엔드포인트 목록"에 추가:
```
GET    /api/approvals/my-history         내 승인 이력 (기간 필터)
PATCH  /api/approvals/:id                승인 의견 수정 (설정 허용 시)
DELETE /api/approvals/:id                승인 취소 (설정 허용 시)
GET    /api/settings/approval-edit       승인 수정/취소 허용 설정
POST   /api/settings/approval-edit       승인 수정/취소 설정 변경 (admin+)
```

3. "핵심 설계 원칙"에 추가:
```
9. 조직도 차트 배치: 저장 버튼 클릭 시에만 반영 (localStorage 저장)
10. 승인 수정/취소: 관리자 정책 설정에 따라 허용 여부 결정
```
