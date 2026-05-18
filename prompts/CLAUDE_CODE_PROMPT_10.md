# Claude Code 작업 지시서 10
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 1 — 조직도 관리 탭: 차트 방식 + 전체화면 추가 (admin.js)

### 현재 상황
renderAdmOrg 함수가 목록 방식만 구현되어 있음.
차트 방식과 전체화면 기능이 없음.

### renderAdmOrg 함수 전체를 아래로 교체:

```javascript
let _orgViewMode = 'list';
let _orgUsers    = [];
let _orgPositions = {};
let _orgUnsaved  = false;

async function renderAdmOrg() {
  const el = document.getElementById('adm-org');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    _orgUsers = await API.get('/users');
    // localStorage에서 저장된 위치 불러오기
    try {
      const saved = localStorage.getItem('org_positions');
      if (saved) _orgPositions = JSON.parse(saved);
    } catch(e) { _orgPositions = {}; }

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-header-t">조직도 관리</div>
            <div class="card-header-s">상위 관리자 변경 시 승인 체계가 자동 반영됩니다</div>
          </div>
        </div>
        <!-- 보기 방식 선택 -->
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
          <button class="btn ${_orgViewMode==='list'?'btn-primary':'btn-ghost'}"
            onclick="_orgViewMode='list';renderAdmOrg()">📋 목록 방식</button>
          <button class="btn ${_orgViewMode==='chart'?'btn-primary':'btn-ghost'}"
            onclick="_orgViewMode='chart';renderAdmOrg()">🏢 차트 방식</button>
          ${_orgViewMode==='chart' ? `
            <button class="btn btn-ghost btn-sm" onclick="autoLayoutOrg()">자동 정렬</button>
            <button class="btn btn-ghost btn-sm" onclick="openOrgFullscreen()">전체화면 🔲</button>
            <button class="btn btn-primary btn-sm" id="org-save-btn"
              style="${_orgUnsaved?'':'opacity:.5'}"
              onclick="saveOrgLayout()">💾 배치 저장</button>
            ${_orgUnsaved ? '<span style="font-size:12px;color:var(--o600)">⚠ 미저장 변경사항</span>' : ''}
          ` : ''}
        </div>
        <div id="org-view-area"></div>
      </div>`;

    if (_orgViewMode === 'list') renderOrgList(_orgUsers);
    else renderOrgChart(_orgUsers, false);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

/* ── 목록 방식 ── */
function renderOrgList(users) {
  const el = document.getElementById('org-view-area');
  if (!el) return;

  function nodeHtml(u, depth) {
    const children = users.filter(x => String(x.manager_id) === String(u.id));
    const approvers = [];
    let cur = users.find(x => String(x.id) === String(u.manager_id));
    let lv = 0;
    while (cur && lv < 5) {
      approvers.push(`${++lv}차 ${cur.name}`);
      cur = users.find(x => String(x.id) === String(cur.manager_id));
    }
    return `<div class="org-node">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div class="avatar" style="background:var(--o100);color:var(--o800);flex-shrink:0">${u.name.slice(0,2)}</div>
        <div style="flex:1;min-width:150px">
          <div style="font-weight:500;font-size:13px">${u.name} ${roleBadge(u.role)}</div>
          <div style="font-size:11px;color:var(--muted)">${u.dept||''} · ${u.grade||''} · ${u.title||''}
            ${approvers.length ? `<span style="color:var(--teal);margin-left:6px">승인: ${approvers.join(' → ')}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <select style="font-size:12px;height:30px;width:120px" onchange="changeManager('${u.id}',this.value)">
            <option value="">상위없음</option>
            ${users.filter(x => String(x.id) !== String(u.id)).map(x =>
              `<option value="${x.id}" ${String(u.manager_id)===String(x.id)?'selected':''}>${x.name}</option>`
            ).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" style="font-size:11px"
            onclick="showUserEditModal(${u.id},'${u.name}','${(u.dept||'').replace(/'/g,"\\'")}','${(u.grade||'').replace(/'/g,"\\'")}','${(u.title||'').replace(/'/g,"\\'")}')">
            ✏ 수정
          </button>
        </div>
      </div>
      ${children.length ? `<div class="org-children">${children.map(c => nodeHtml(c, depth+1)).join('')}</div>` : ''}
    </div>`;
  }

  const roots = users.filter(u => !u.manager_id);
  el.innerHTML = `
    <div class="alert alert-orange" style="font-size:12px;margin-bottom:12px">
      상위 관리자를 변경하면 해당 직원의 승인 단계가 자동으로 갱신됩니다.
    </div>
    ${roots.map(u => nodeHtml(u, 0)).join('')}`;
}

/* ── 차트 방식 ── */
function renderOrgChart(users, isFullscreen) {
  const containerId = isFullscreen ? 'org-fs-area' : 'org-view-area';
  const el = document.getElementById(containerId);
  if (!el) return;

  const NODE_W = 130, NODE_H = 70, H_GAP = 40, V_GAP = 90;

  // 계층 레벨 계산
  function getLevel(uid, visited) {
    if (!uid || visited.has(String(uid))) return 0;
    visited.add(String(uid));
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
  users.forEach(u => {
    const lv = levelMap[u.id] || 0;
    if (!byLevel[lv]) byLevel[lv] = [];
    byLevel[lv].push(u);
  });

  // 캔버스 크기
  const maxCount = Math.max(...Object.values(byLevel).map(g => g.length), 1);
  const canvasW  = Math.max(isFullscreen ? 2000 : 1000, maxCount * (NODE_W + H_GAP) + 200);
  const canvasH  = Math.max(isFullscreen ? 1200 : 600,  (maxLevel + 1) * (NODE_H + V_GAP) + 100);

  // 초기 위치 계산 (저장된 것 없는 경우만)
  for (let l = 0; l <= maxLevel; l++) {
    const group  = byLevel[l] || [];
    const groupW = group.length * (NODE_W + H_GAP) - H_GAP;
    const startX = (canvasW - groupW) / 2; // 중앙 정렬
    group.forEach((u, i) => {
      if (!_orgPositions[u.id]) {
        _orgPositions[u.id] = {
          x: startX + i * (NODE_W + H_GAP),
          y: 30 + l * (NODE_H + V_GAP),
        };
      }
    });
  }

  // HTML 구성
  el.innerHTML = `
    <div id="org-scroll-wrap-${isFullscreen?'fs':'main'}"
      style="width:100%;height:${isFullscreen?'calc(100vh - 60px)':'480px'};overflow:auto;
        background:var(--bg);border:1px solid var(--border);border-radius:8px;position:relative">
      <div id="org-inner-${isFullscreen?'fs':'main'}"
        style="position:relative;width:${canvasW}px;height:${canvasH}px">
        <svg id="org-svg-${isFullscreen?'fs':'main'}"
          width="${canvasW}" height="${canvasH}"
          style="position:absolute;top:0;left:0;pointer-events:none;z-index:1"></svg>
        <div id="org-nodes-${isFullscreen?'fs':'main'}"
          style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:2"></div>
      </div>
    </div>`;

  const suffix   = isFullscreen ? 'fs' : 'main';
  const svgEl    = document.getElementById('org-svg-' + suffix);
  const nodesEl  = document.getElementById('org-nodes-' + suffix);
  const scrollEl = document.getElementById('org-scroll-wrap-' + suffix);

  // 연결선 그리기
  function drawLines() {
    if (!svgEl) return;
    svgEl.innerHTML = '';
    users.forEach(u => {
      if (!u.manager_id || !_orgPositions[u.id] || !_orgPositions[u.manager_id]) return;
      const fp = _orgPositions[u.manager_id];
      const tp = _orgPositions[u.id];
      const x1 = fp.x + NODE_W/2, y1 = fp.y + NODE_H;
      const x2 = tp.x + NODE_W/2, y2 = tp.y;
      const my = (y1 + y2) / 2;

      const g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.style.pointerEvents = 'all';
      g.style.cursor = 'pointer';

      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      path.setAttribute('stroke','var(--o400)');
      path.setAttribute('stroke-width','2');
      path.setAttribute('fill','none');

      const hit = document.createElementNS('http://www.w3.org/2000/svg','path');
      hit.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      hit.setAttribute('stroke','transparent');
      hit.setAttribute('stroke-width','14');
      hit.setAttribute('fill','none');

      const arrow = document.createElementNS('http://www.w3.org/2000/svg','polygon');
      arrow.setAttribute('points',`${x2-5},${y2-8} ${x2+5},${y2-8} ${x2},${y2}`);
      arrow.setAttribute('fill','var(--o400)');

      g.appendChild(path); g.appendChild(hit); g.appendChild(arrow);
      g.onmouseenter = () => { path.setAttribute('stroke','var(--red)'); arrow.setAttribute('fill','var(--red)'); };
      g.onmouseleave = () => { path.setAttribute('stroke','var(--o400)'); arrow.setAttribute('fill','var(--o400)'); };
      g.onclick = async () => {
        const mName = users.find(x=>String(x.id)===String(u.manager_id))?.name||'';
        if (!confirm(`${u.name} → ${mName} 연결을 해제하시겠습니까?`)) return;
        try {
          await API.patch('/users/'+u.id, { manager_id: null });
          u.manager_id = null;
          drawLines();
          showAlert(u.name+'의 상위관리자 연결이 해제되었습니다.','green');
        } catch(e) { showAlert(e.message,'red'); }
      };
      svgEl.appendChild(g);
    });
  }

  // 임시 선
  const tempLine = document.createElementNS('http://www.w3.org/2000/svg','path');
  tempLine.setAttribute('stroke','var(--o400)');
  tempLine.setAttribute('stroke-width','2');
  tempLine.setAttribute('stroke-dasharray','6,3');
  tempLine.setAttribute('fill','none');
  tempLine.style.display = 'none';
  tempLine.style.pointerEvents = 'none';
  svgEl.appendChild(tempLine);

  let dragState = null, lineState = null;

  // 노드 생성
  users.forEach(u => {
    const pos  = _orgPositions[u.id] || { x:20, y:20 };
    const node = document.createElement('div');
    node.id    = 'orgnode-'+suffix+'-'+u.id;
    node.dataset.uid = u.id;
    node.style.cssText = `
      position:absolute;left:${pos.x}px;top:${pos.y}px;
      width:${NODE_W}px;height:${NODE_H}px;
      background:var(--white);border:2px solid var(--o200);border-radius:10px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:4px 6px;cursor:grab;user-select:none;
      box-shadow:0 2px 6px rgba(0,0,0,.08);`;
    node.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--o800);text-align:center">${u.name}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:1px;text-align:center">${u.grade||''} ${u.title||''}</div>
      <div style="font-size:10px;color:var(--muted);text-align:center">${u.dept||''}</div>
      <div class="org-dot" data-uid="${u.id}"
        style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);
          width:14px;height:14px;border-radius:50%;
          background:var(--o400);border:2px solid #fff;cursor:crosshair;z-index:10"
        title="드래그하여 상위관리자 연결"></div>`;

    // 박스 드래그
    node.addEventListener('mousedown', e => {
      if (e.target.classList.contains('org-dot')) return;
      const inner = document.getElementById('org-inner-'+suffix);
      const iRect = inner.getBoundingClientRect();
      dragState = {
        uid: u.id, node,
        startX: e.clientX, startY: e.clientY,
        origX: _orgPositions[u.id]?.x||0,
        origY: _orgPositions[u.id]?.y||0,
      };
      node.style.zIndex = 50;
      node.style.cursor = 'grabbing';
      e.preventDefault();
    });

    // 연결 점 드래그
    node.querySelector('.org-dot').addEventListener('mousedown', e => {
      e.stopPropagation();
      const p = _orgPositions[u.id];
      lineState = { fromUid: u.id, fromX: p.x+NODE_W/2, fromY: p.y+NODE_H };
      tempLine.style.display = '';
      e.preventDefault();
    });

    nodesEl.appendChild(node);
  });

  drawLines();

  // 마우스 이벤트
  function onMove(e) {
    const inner = document.getElementById('org-inner-'+suffix);
    if (!inner) return;
    const iRect = inner.getBoundingClientRect();
    const mx = e.clientX - iRect.left;
    const my = e.clientY - iRect.top;

    if (dragState) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const nx = Math.max(0, dragState.origX + dx);
      const ny = Math.max(0, dragState.origY + dy);
      _orgPositions[dragState.uid] = { x: nx, y: ny };
      dragState.node.style.left = nx+'px';
      dragState.node.style.top  = ny+'px';
      drawLines();
      // 미저장 표시
      _orgUnsaved = true;
      const saveBtn = document.getElementById('org-save-btn');
      if (saveBtn) saveBtn.style.opacity = '1';
    }

    if (lineState) {
      const x1 = lineState.fromX, y1 = lineState.fromY;
      const mid = (y1+my)/2;
      tempLine.setAttribute('d',`M${x1},${y1} C${x1},${mid} ${mx},${mid} ${mx},${my}`);
      users.forEach(u => {
        const n = document.getElementById('orgnode-'+suffix+'-'+u.id);
        if (!n) return;
        const p = _orgPositions[u.id];
        const inBox = mx>=p.x && mx<=p.x+NODE_W && my>=p.y && my<=p.y+NODE_H;
        n.style.borderColor = (inBox && String(u.id)!==String(lineState.fromUid)) ? 'var(--green)' : 'var(--o200)';
      });
    }
  }

  async function onUp(e) {
    const inner = document.getElementById('org-inner-'+suffix);
    if (!inner) return;
    const iRect = inner.getBoundingClientRect();
    const mx = e.clientX - iRect.left;
    const my = e.clientY - iRect.top;

    if (dragState) {
      dragState.node.style.zIndex = '';
      dragState.node.style.cursor = 'grab';
      dragState = null;
    }

    if (lineState) {
      tempLine.style.display = 'none';
      tempLine.setAttribute('d','');
      users.forEach(u => {
        const n = document.getElementById('orgnode-'+suffix+'-'+u.id);
        if (n) n.style.borderColor = 'var(--o200)';
      });

      let dropUid = null;
      users.forEach(u => {
        if (String(u.id)===String(lineState.fromUid)) return;
        const p = _orgPositions[u.id];
        if (mx>=p.x && mx<=p.x+NODE_W && my>=p.y && my<=p.y+NODE_H) dropUid = u.id;
      });

      if (dropUid) {
        // 순환 참조 체크
        let check = users.find(x=>String(x.id)===String(dropUid));
        let circular = false, depth = 0;
        while (check?.manager_id && depth<10) {
          if (String(check.manager_id)===String(lineState.fromUid)) { circular=true; break; }
          check = users.find(x=>String(x.id)===String(check.manager_id));
          depth++;
        }
        if (circular) {
          showAlert('순환 참조가 발생합니다.','red');
        } else {
          // 위치 기반 상/하 결정
          const fromPos = _orgPositions[lineState.fromUid];
          const dropPos = _orgPositions[dropUid];
          let childUid, parentUid;
          if (fromPos.y > dropPos.y) {
            childUid=lineState.fromUid; parentUid=dropUid;
          } else {
            childUid=dropUid; parentUid=lineState.fromUid;
          }
          try {
            await API.patch('/users/'+childUid, { manager_id: parentUid });
            const idx = users.findIndex(x=>String(x.id)===String(childUid));
            if (idx!==-1) users[idx].manager_id = parentUid;
            drawLines();
            const cName = users.find(x=>String(x.id)===String(childUid))?.name||'';
            const pName = users.find(x=>String(x.id)===String(parentUid))?.name||'';
            showAlert(`${cName}의 상위관리자 → ${pName}으로 설정되었습니다.`,'green');
          } catch(err) { showAlert(err.message,'red'); }
        }
      }
      lineState = null;
    }
  }

  // 스크롤 래퍼에 이벤트 등록
  scrollEl.addEventListener('mousemove', onMove);
  scrollEl.addEventListener('mouseup', onUp);
  document.addEventListener('mouseup', () => {
    if (dragState) { dragState.node.style.zIndex=''; dragState.node.style.cursor='grab'; dragState=null; }
    if (lineState) { tempLine.style.display='none'; lineState=null;
      users.forEach(u=>{ const n=document.getElementById('orgnode-'+suffix+'-'+u.id); if(n) n.style.borderColor='var(--o200)'; }); }
  });
}

/* ── 자동 정렬 ── */
function autoLayoutOrg() {
  _orgPositions = {};
  renderOrgChart(_orgUsers, false);
  // 전체화면도 열려있으면 갱신
  if (document.getElementById('org-fullscreen')) {
    renderOrgChart(_orgUsers, true);
  }
}

/* ── 배치 저장 ── */
function saveOrgLayout() {
  try {
    localStorage.setItem('org_positions', JSON.stringify(_orgPositions));
    _orgUnsaved = false;
    showAlert('조직도 배치가 저장되었습니다.','green');
    renderAdmOrg();
  } catch(e) { showAlert('저장 실패: '+e.message,'red'); }
}

/* ── 전체화면 팝업 ── */
function openOrgFullscreen() {
  if (document.getElementById('org-fullscreen')) return;
  const overlay = document.createElement('div');
  overlay.id = 'org-fullscreen';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.9);z-index:9999;display:flex;flex-direction:column';
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--o500);flex-shrink:0">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="color:#fff;font-size:15px;font-weight:600">조직도 편집 — 전체화면</span>
        <span style="font-size:12px;color:rgba(255,255,255,.7)">박스 드래그: 이동 · 하단 점 드래그: 연결 · 선 클릭: 해제</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none"
          onclick="_orgPositions={};renderOrgChart(_orgUsers,true)">자동 정렬</button>
        <button class="btn btn-sm" style="background:var(--green);color:#fff;border:none"
          onclick="saveOrgLayout();closeOrgFullscreen()">💾 저장 후 닫기</button>
        <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none"
          onclick="closeOrgFullscreen()">✕ 닫기</button>
      </div>
    </div>
    <div id="org-fs-area" style="flex:1;overflow:hidden;padding:10px"></div>`;
  document.body.appendChild(overlay);
  // 전체화면에서 차트 렌더
  renderOrgChart(_orgUsers, true);
}

function closeOrgFullscreen() {
  document.getElementById('org-fullscreen')?.remove();
  // 메인 캔버스에 최신 위치 반영
  renderOrgChart(_orgUsers, false);
}

/* ── 사용자 정보 수정 모달 ── */
function showUserEditModal(uid, name, dept, grade, title) {
  document.getElementById('user-edit-modal')?.remove();
  const ranks = ['사원','대리','과장','차장','부장','이사','상무','전무','부사장','사장','기타'];
  const overlay = document.createElement('div');
  overlay.id = 'user-edit-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:12px;padding:24px;width:100%;max-width:400px;margin:20px">
      <div style="font-size:15px;font-weight:600;margin-bottom:16px">${name} 정보 수정</div>
      <div class="form-group" style="margin-bottom:10px">
        <label>부서</label>
        <input id="ue-dept" value="${dept||''}" placeholder="예: 개발팀, 마케팅본부">
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label>직급</label>
        <select id="ue-grade-sel" style="height:36px;font-size:13px" onchange="toggleGradeInput()">
          ${ranks.map(r => `<option value="${r}" ${grade===r?'selected':''}>${r}</option>`).join('')}
        </select>
        <input id="ue-grade-custom" placeholder="직급 직접 입력"
          style="margin-top:6px;display:${ranks.includes(grade)?'none':''}"
          value="${ranks.includes(grade)?'':grade||''}">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>직책</label>
        <input id="ue-title" value="${title||''}" placeholder="예: 팀장, 선임연구원">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('user-edit-modal').remove()">취소</button>
        <button class="btn btn-primary" onclick="saveUserInfo(${uid})">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function toggleGradeInput() {
  const sel = document.getElementById('ue-grade-sel');
  const custom = document.getElementById('ue-grade-custom');
  if (!sel || !custom) return;
  custom.style.display = sel.value === '기타' ? '' : 'none';
}

async function saveUserInfo(uid) {
  const dept  = document.getElementById('ue-dept')?.value.trim()  || '';
  const grSel = document.getElementById('ue-grade-sel')?.value    || '';
  const grCus = document.getElementById('ue-grade-custom')?.value.trim() || '';
  const grade = grSel === '기타' ? grCus : grSel;
  const title = document.getElementById('ue-title')?.value.trim() || '';
  try {
    await API.patch('/users/'+uid, { dept, grade, title });
    showAlert('정보가 수정되었습니다.','green');
    document.getElementById('user-edit-modal')?.remove();
    renderAdmOrg();
  } catch(e) { showAlert(e.message,'red'); }
}
```

---

## 작업 2 — server/index.js: grade 컬럼 추가

### 2-1. users 테이블에 grade 컬럼 마이그레이션
migrations 배열에 추가:
```javascript
"ALTER TABLE users ADD COLUMN grade TEXT DEFAULT ''",
```

### 2-2. PATCH /api/users/:id 에서 grade 처리 추가
기존 PATCH /api/users/:id 라우트에서
`const { role, dept, title, manager_id, is_active } = req.body;` 를
`const { role, dept, grade, title, manager_id, is_active } = req.body;` 로 변경.

UPDATE 쿼리에 `grade = COALESCE(?, grade),` 추가.

### 2-3. GET /api/users 응답에 grade 포함 확인
users SELECT 쿼리에 grade 컬럼이 포함되도록:
```javascript
// 기존 SELECT에 grade 추가
'SELECT id,name,email,role,dept,grade,title,manager_id,is_active,account_status FROM users ...'
```

### 2-4. POST /api/auth/signup에 grade 처리 추가
```javascript
const { name, email, password, dept, grade, title, signup_note } = req.body;
// INSERT에 grade 추가
'INSERT INTO users(name,email,password_hash,role,dept,grade,title,...) VALUES(?,?,?,?,?,?,?,?,?,?)'
// run에 grade 값 추가
.run(name, email, hash, 'user', dept||'', grade||'', title||'', 'pending', signup_note||'', 0);
```

---

## 작업 3 — login.js: 가입 신청 폼에 직급 추가

### doSignup 함수에 grade 추가:
```javascript
const grade = (() => {
  const sel = document.getElementById('su-grade-sel')?.value || '';
  const cus = document.getElementById('su-grade-custom')?.value.trim() || '';
  return sel === '기타' ? cus : sel;
})();
```

API 호출 시 grade 포함:
```javascript
body: JSON.stringify({ name, email, password: pw, dept, grade, title, signup_note: note })
```

### 가입 폼 HTML에 직급 셀렉트 추가
기존 부서/직책 form-row 사이에 직급 필드 추가:

```html
<div class="form-group" style="margin-bottom:10px">
  <label>직급 *</label>
  <select id="su-grade-sel" style="height:36px;font-size:13px;width:100%"
    onchange="document.getElementById('su-grade-custom').style.display=this.value==='기타'?'':'none'">
    <option value="">선택하세요</option>
    <option>사원</option><option>대리</option><option>과장</option>
    <option>차장</option><option>부장</option><option>이사</option>
    <option>상무</option><option>전무</option><option>부사장</option>
    <option>사장</option><option>기타</option>
  </select>
  <input id="su-grade-custom" placeholder="직급 직접 입력"
    style="margin-top:6px;display:none">
</div>
```

---

## 작업 4 — 조직도에 grade 표시

### my-eval.js: 승인자 체인 표시에 grade 포함
```javascript
// 기존: `${i+1}차 ${a.name}(${a.title||''})`
// 수정: `${i+1}차 ${a.name}(${a.grade||''} ${a.title||''})`
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

1. "DB 스키마"에서 users 테이블에 grade 컬럼 추가 기록:
   ```
   users: id, name, email, password_hash, role, dept, grade, title, manager_id, is_active, account_status, signup_note
   ```

2. "개발 이력"에 추가:
   ```
   | 오늘날짜 | 조직도차트방식구현(목록/차트전환,전체화면,저장버튼,중앙정렬,스크롤), 직급필드추가, 부서직책편집모달 | Claude Code |
   ```

3. "핵심 설계 원칙"에 추가:
   ```
   9. 조직도 차트 배치: localStorage 저장, 저장 버튼 클릭 시에만 반영
   10. 직급(grade): 사원~사장 선택 또는 직접입력, users.grade 컬럼
   ```
