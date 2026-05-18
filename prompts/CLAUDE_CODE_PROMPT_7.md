# Claude Code 작업 지시서 7 — 조직도/피드백/전직원현황/정책 개선
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 1 — 조직도 차트 방식 개선 (public/js/pages/admin.js)

### 핵심 설계 변경
- 드래그로 위치 재배치 → 연결선은 위치 기반으로 자동 재계산 (끊어짐 없음)
- 마우스로 선 직접 연결: 노드의 하단 점(●)에서 드래그 → 다른 노드 위에 드롭 → 상위관리자 설정
- 위쪽 노드 = 상위(승인자), 아래쪽 노드 = 하위(피평가자)로 시각적으로 인식

### renderOrgChart 함수 전체를 아래로 교체:

```javascript
function renderOrgChart(users) {
  const el = document.getElementById('org-view-area');
  if (!el) return;

  el.innerHTML = `
    <div style="margin-bottom:10px;font-size:12px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap">
      <span>🔵 박스 드래그: 위치 재배치 (연결선 자동 유지)</span>
      <span>🟠 하단 점 드래그: 상위관리자 연결</span>
      <span>❌ 연결선 클릭: 연결 해제</span>
    </div>
    <div id="org-canvas-wrap" style="position:relative;width:100%;min-height:520px;
      background:var(--bg);border:1px solid var(--border);border-radius:8px;overflow:hidden">
      <svg id="org-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1"></svg>
      <div id="org-nodes" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:2"></div>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" onclick="autoLayoutOrg()">자동 정렬</button>
      <button class="btn btn-ghost btn-sm" onclick="renderOrgChart(window._orgUsers)">초기화</button>
    </div>`;

  window._orgUsers = users;

  // 노드 위치 저장 (로컬, 새로고침 시 초기화)
  if (!window._orgPositions) window._orgPositions = {};

  // 초기 위치 계산 (저장된 위치 없으면 자동 배치)
  function initPositions(users) {
    const NODE_W = 130, NODE_H = 64, H_GAP = 30, V_GAP = 80;
    // 계층 계산
    const levelMap = {};
    function getLevel(uid, depth) {
      if (depth > 10) return 0;
      const u = users.find(x => String(x.id) === String(uid));
      if (!u || !u.manager_id) return 0;
      return getLevel(u.manager_id, depth + 1) + 1;
    }
    users.forEach(u => { levelMap[u.id] = getLevel(u.id, 0); });
    const maxLevel = Math.max(...Object.values(levelMap));

    // 레벨별 그룹
    const byLevel = {};
    for (let l = 0; l <= maxLevel; l++) byLevel[l] = [];
    users.forEach(u => byLevel[levelMap[u.id]].push(u));

    // 위치 지정
    const canvasW = Math.max(600, users.length * (NODE_W + H_GAP));
    byLevel[0] = byLevel[0] || [];
    for (let l = 0; l <= maxLevel; l++) {
      const group = byLevel[l] || [];
      const totalW = group.length * (NODE_W + H_GAP) - H_GAP;
      const startX = Math.max(20, (canvasW - totalW) / 2);
      group.forEach((u, i) => {
        if (!window._orgPositions[u.id]) {
          window._orgPositions[u.id] = {
            x: startX + i * (NODE_W + H_GAP),
            y: 20 + l * (NODE_H + V_GAP),
          };
        }
      });
    }
  }

  initPositions(users);

  const wrap  = document.getElementById('org-canvas-wrap');
  const svg   = document.getElementById('org-svg');
  const nodes = document.getElementById('org-nodes');

  // 캔버스 크기 동적 계산
  function updateCanvasSize() {
    let maxX = 600, maxY = 400;
    users.forEach(u => {
      const p = window._orgPositions[u.id];
      if (p) { maxX = Math.max(maxX, p.x + 150); maxY = Math.max(maxY, p.y + 100); }
    });
    wrap.style.minHeight = maxY + 40 + 'px';
    svg.setAttribute('width',  maxX + 40);
    svg.setAttribute('height', maxY + 40);
  }

  // 연결선 그리기
  function drawLines() {
    svg.innerHTML = '';
    users.forEach(u => {
      if (!u.manager_id) return;
      const fp = window._orgPositions[u.manager_id];
      const tp = window._orgPositions[u.id];
      if (!fp || !tp) return;
      const NODE_W = 130, NODE_H = 64;
      const x1 = fp.x + NODE_W / 2, y1 = fp.y + NODE_H;
      const x2 = tp.x + NODE_W / 2, y2 = tp.y;
      const my = (y1 + y2) / 2;

      // 연결선 (클릭으로 해제 가능)
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.style.pointerEvents = 'all';
      g.style.cursor = 'pointer';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      path.setAttribute('stroke', 'var(--o400)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');

      // 투명 클릭 영역
      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitPath.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('stroke-width', '12');
      hitPath.setAttribute('fill', 'none');

      // 화살표
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      arrow.setAttribute('points', `${x2-5},${y2-8} ${x2+5},${y2-8} ${x2},${y2}`);
      arrow.setAttribute('fill', 'var(--o400)');

      g.appendChild(path);
      g.appendChild(hitPath);
      g.appendChild(arrow);

      // 연결 해제 클릭
      g.onclick = async function() {
        const uName = u.name;
        const mName = users.find(x => String(x.id) === String(u.manager_id))?.name || '';
        if (!confirm(`${uName} → ${mName} 연결을 해제하시겠습니까?\n(${uName}이 최상위로 이동됩니다)`)) return;
        try {
          await API.patch('/users/' + u.id, { manager_id: null });
          u.manager_id = null;
          const idx = window._orgUsers.findIndex(x => String(x.id) === String(u.id));
          if (idx !== -1) window._orgUsers[idx].manager_id = null;
          drawLines();
          showAlert(uName + '의 상위관리자 연결이 해제되었습니다.', 'green');
        } catch(e) { showAlert(e.message, 'red'); }
      };

      g.onmouseenter = function() { path.setAttribute('stroke', 'var(--red)'); arrow.setAttribute('fill', 'var(--red)'); };
      g.onmouseleave = function() { path.setAttribute('stroke', 'var(--o400)'); arrow.setAttribute('fill', 'var(--o400)'); };

      svg.appendChild(g);
    });
  }

  // 노드 생성
  const NODE_W = 130, NODE_H = 64;
  let dragState = null;    // 박스 드래그
  let lineState = null;    // 선 연결 드래그

  // 임시 연결선 (드래그 중)
  const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tempLine.setAttribute('stroke', 'var(--o400)');
  tempLine.setAttribute('stroke-width', '2');
  tempLine.setAttribute('stroke-dasharray', '6,3');
  tempLine.setAttribute('fill', 'none');
  tempLine.style.display = 'none';
  tempLine.style.pointerEvents = 'none';
  svg.appendChild(tempLine);

  function createNode(u) {
    const pos = window._orgPositions[u.id] || { x: 20, y: 20 };
    const node = document.createElement('div');
    node.id = 'org-n-' + u.id;
    node.dataset.uid = u.id;
    node.style.cssText = `
      position:absolute;
      left:${pos.x}px;top:${pos.y}px;
      width:${NODE_W}px;height:${NODE_H}px;
      background:var(--white);
      border:2px solid var(--o200);
      border-radius:10px;
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      padding:4px 6px;
      box-shadow:0 2px 6px rgba(0,0,0,.08);
      user-select:none;
      transition:border-color .15s, box-shadow .15s;`;

    node.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--o800);text-align:center;line-height:1.3">${u.name}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px;text-align:center">${u.title||u.dept||''}</div>
      <div style="margin-top:3px">${roleBadge(u.role)}</div>
      <div class="org-conn-dot" data-uid="${u.id}"
        style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);
          width:14px;height:14px;border-radius:50%;
          background:var(--o400);border:2px solid #fff;
          cursor:crosshair;z-index:10"
        title="드래그하여 상위관리자 연결"></div>`;

    // ── 박스 드래그 (위치 재배치) ──────────────────────
    node.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('org-conn-dot')) return; // 점 드래그는 별도
      dragState = {
        uid: u.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: window._orgPositions[u.id].x,
        origY: window._orgPositions[u.id].y,
      };
      node.style.zIndex = 50;
      node.style.boxShadow = '0 8px 24px rgba(240,120,32,.3)';
      node.style.borderColor = 'var(--o400)';
      e.preventDefault();
    });

    // ── 연결 점 드래그 (선 연결) ──────────────────────
    const dot = node.querySelector('.org-conn-dot');
    dot.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      const wrapRect = wrap.getBoundingClientRect();
      const pos2 = window._orgPositions[u.id];
      lineState = {
        fromUid: u.id,
        fromX: pos2.x + NODE_W / 2,
        fromY: pos2.y + NODE_H,
      };
      tempLine.style.display = '';
      e.preventDefault();
    });

    nodes.appendChild(node);
    return node;
  }

  users.forEach(u => createNode(u));
  updateCanvasSize();
  drawLines();

  // ── 전역 마우스 이벤트 ──────────────────────────────
  function onMouseMove(e) {
    const wrapRect = wrap.getBoundingClientRect();
    const mx = e.clientX - wrapRect.left;
    const my = e.clientY - wrapRect.top;

    // 박스 드래그
    if (dragState) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const newX = Math.max(0, dragState.origX + dx);
      const newY = Math.max(0, dragState.origY + dy);
      window._orgPositions[dragState.uid] = { x: newX, y: newY };
      const nodeEl = document.getElementById('org-n-' + dragState.uid);
      if (nodeEl) { nodeEl.style.left = newX + 'px'; nodeEl.style.top = newY + 'px'; }
      drawLines(); // 연결선 실시간 업데이트
      updateCanvasSize();
    }

    // 선 드래그
    if (lineState) {
      const x1 = lineState.fromX, y1 = lineState.fromY;
      const mid = (y1 + my) / 2;
      tempLine.setAttribute('d', `M${x1},${y1} C${x1},${mid} ${mx},${mid} ${mx},${my}`);
      // 호버 노드 강조
      users.forEach(u => {
        const nodeEl = document.getElementById('org-n-' + u.id);
        if (!nodeEl) return;
        const p = window._orgPositions[u.id];
        const inBox = mx >= p.x && mx <= p.x + NODE_W && my >= p.y && my <= p.y + NODE_H;
        nodeEl.style.borderColor = (inBox && String(u.id) !== String(lineState.fromUid)) ? 'var(--green)' : 'var(--o200)';
      });
    }
  }

  async function onMouseUp(e) {
    const wrapRect = wrap.getBoundingClientRect();
    const mx = e.clientX - wrapRect.left;
    const my = e.clientY - wrapRect.top;

    // 박스 드래그 종료
    if (dragState) {
      const nodeEl = document.getElementById('org-n-' + dragState.uid);
      if (nodeEl) {
        nodeEl.style.zIndex = '';
        nodeEl.style.boxShadow = '0 2px 6px rgba(0,0,0,.08)';
        nodeEl.style.borderColor = 'var(--o200)';
      }
      dragState = null;
    }

    // 선 드래그 종료 — 드롭 대상 찾기
    if (lineState) {
      tempLine.style.display = 'none';
      tempLine.setAttribute('d', '');

      // 호버 강조 초기화
      users.forEach(u => {
        const nodeEl = document.getElementById('org-n-' + u.id);
        if (nodeEl) nodeEl.style.borderColor = 'var(--o200)';
      });

      // 드롭된 노드 찾기
      let dropUid = null;
      users.forEach(u => {
        if (String(u.id) === String(lineState.fromUid)) return;
        const p = window._orgPositions[u.id];
        if (mx >= p.x && mx <= p.x + NODE_W && my >= p.y && my <= p.y + NODE_H) {
          dropUid = u.id;
        }
      });

      if (dropUid) {
        // 순환 참조 체크
        let check = users.find(x => String(x.id) === String(dropUid));
        let circular = false;
        let depth = 0;
        while (check?.manager_id && depth < 10) {
          if (String(check.manager_id) === String(lineState.fromUid)) { circular = true; break; }
          check = users.find(x => String(x.id) === String(check.manager_id));
          depth++;
        }
        if (circular) {
          showAlert('순환 참조가 발생합니다. 연결할 수 없습니다.', 'red');
        } else {
          // 위치 기반으로 상/하 관계 결정
          // 드롭 대상이 위에 있으면 → 드롭 대상이 상위관리자
          // 드롭 대상이 아래 있으면 → fromUid가 상위관리자
          const fromPos  = window._orgPositions[lineState.fromUid];
          const dropPos  = window._orgPositions[dropUid];
          const fromName = users.find(x => String(x.id) === String(lineState.fromUid))?.name;
          const dropName = users.find(x => String(x.id) === String(dropUid))?.name;

          let childUid, parentUid, childName, parentName;
          if (fromPos.y > dropPos.y) {
            // from이 아래 → from이 하위(피평가자), drop이 상위(승인자)
            childUid = lineState.fromUid; parentUid = dropUid;
            childName = fromName; parentName = dropName;
          } else {
            // from이 위 → from이 상위(승인자), drop이 하위(피평가자)
            childUid = dropUid; parentUid = lineState.fromUid;
            childName = dropName; parentName = fromName;
          }

          try {
            await API.patch('/users/' + childUid, { manager_id: parentUid });
            const idx = users.findIndex(x => String(x.id) === String(childUid));
            if (idx !== -1) users[idx].manager_id = parentUid;
            drawLines();
            showAlert(`${childName}의 상위관리자 → ${parentName}으로 설정되었습니다.`, 'green');
          } catch(err) { showAlert(err.message, 'red'); }
        }
      }
      lineState = null;
    }
  }

  // 이벤트 리스너 (wrap 기준)
  wrap.addEventListener('mousemove', onMouseMove);
  wrap.addEventListener('mouseup', onMouseUp);
  // wrap 밖에서 마우스업 처리
  document.addEventListener('mouseup', function() {
    if (dragState || lineState) {
      dragState = null;
      if (lineState) { tempLine.style.display = 'none'; lineState = null; }
      users.forEach(u => {
        const n = document.getElementById('org-n-' + u.id);
        if (n) { n.style.borderColor = 'var(--o200)'; n.style.zIndex = ''; }
      });
    }
  });
}

// 자동 정렬
function autoLayoutOrg() {
  window._orgPositions = {};
  renderOrgChart(window._orgUsers);
}
```

---

## 작업 2 — 중간 피드백 UI 개선 (public/js/pages/feedback.js)

### 2-1. textarea 너비 수정

feedback.js에서 목표별 피드백 textarea와 종합 피드백 textarea를 찾아서
style에 `width:100%` 가 없으면 추가.

구체적으로 feedback.js 안의 모든 textarea 태그를 찾아서:
```html
style="min-height:40px"  →  style="width:100%;min-height:60px;resize:vertical"
style="min-height:48px"  →  style="width:100%;min-height:72px;resize:vertical"
style="min-height:56px"  →  style="width:100%;min-height:72px;resize:vertical"
```
로 교체. (min-height 값은 기존보다 크게 조정)

### 2-2. 1차 상사 피드백 의무화, 2차 이상 선택

renderGiveFeedback 함수 안에서 피드백 제출 버튼 부분을 수정.

각 reporteeEv 카드에서 submitFeedback 버튼 위에 아래 안내 추가:

```javascript
// 현재 로그인한 사람이 해당 직원의 몇 차 승인자인지 확인
const approverRes = await API.get('/users/' + ev.user_id + '/approvers');
const approvers = Array.isArray(approverRes) ? approverRes : (approverRes.approvers || []);
const myLevel = approvers.findIndex(a => String(a.id) === String(App.user.id)) + 1;
const isMandatory = myLevel === 1; // 1차 상사만 의무
```

카드 하단 제출 버튼 영역에 아래 표시 추가:
```javascript
const mandatoryBadge = isMandatory
  ? '<span class="bd bd-rejected" style="font-size:11px">1차 상사 — 피드백 의무</span>'
  : '<span class="bd bd-draft" style="font-size:11px">2차 이상 — 피드백 선택</span>';
```

그리고 submitFeedback 함수에서 1차 상사인 경우 내용이 비어있으면 경고:
```javascript
async function submitFeedback(evalId, goalIdsStr) {
  // 기존 코드 유지하되, 제출 전 검증 추가
  const items = ...; // 기존 로직
  const overall = ...;
  
  // 1차 상사 의무 체크
  const approverRes2 = await API.get('/users/' + evalId_userId + '/approvers');
  // ... 단, evalId로 user_id를 먼저 조회해야 함
  // 간단하게: 내용이 없으면 확인 팝업
  if (!items.length && !overall.trim()) {
    if (!confirm('피드백 내용이 없습니다. 빈 피드백을 제출하시겠습니까?')) return;
  }
  // 기존 제출 로직 계속...
}
```

---

## 작업 3 — 전직원 평가 현황: 사람별 조회 + 멀티 기간 표시 (admin.js)

### 3-1. 필터 UI에 사람 선택 추가

renderAdmStatus 함수의 filterCard innerHTML을 아래로 교체:

```javascript
filterCard.innerHTML = `
  <div style="font-size:13px;font-weight:600;color:var(--o800);margin-bottom:10px">📊 조회 옵션</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
    <div style="flex:1;min-width:150px">
      <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">평가 기간</label>
      <select id="status-period-filter" style="height:34px;font-size:13px;width:100%">
        <option value="">전체 기간</option>
        ${periods.map(p =>
          `<option value="${p.period_label}|${p.eval_year}"
            ${(_statusPeriodFilter.label === p.period_label && _statusPeriodFilter.year === p.eval_year) ? 'selected' : ''}>
            ${p.period_label} ${p.is_active ? '🟢' : '⚪'}
          </option>`
        ).join('')}
      </select>
    </div>
    <div style="flex:1;min-width:150px">
      <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">직원 선택</label>
      <select id="status-user-filter" style="height:34px;font-size:13px;width:100%">
        <option value="">전체 직원</option>
        ${data.map(u => `<option value="${u.id}" ${_statusUserFilter===String(u.id)?'selected':''}>${u.name} (${u.dept})</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-primary" style="height:34px" onclick="applyStatusFilter()">조회</button>
    ${(_statusPeriodFilter.label || _statusUserFilter) ? `<button class="btn btn-ghost" style="height:34px" onclick="clearStatusFilter()">초기화</button>` : ''}
  </div>
  <div style="margin-top:8px;font-size:12px;color:var(--muted)">
    현재: <strong>${selectedPeriodText}</strong>
    ${_statusUserFilter ? ` · 직원: <strong>${data.find(u=>String(u.id)===_statusUserFilter)?.name||''}</strong>` : ''}
  </div>`;
```

### 3-2. 전역 변수 추가

admin.js 상단(또는 renderAdmStatus 위)에 추가:
```javascript
let _statusUserFilter = ''; // 선택된 직원 ID
```

### 3-3. 특정 직원 선택 시 — 해당 직원의 모든 기간 평가 표시

applyStatusFilter 함수를 아래로 교체:

```javascript
function applyStatusFilter() {
  const periodSel = document.getElementById('status-period-filter');
  const userSel   = document.getElementById('status-user-filter');
  const periodVal = periodSel?.value || '';
  const userVal   = userSel?.value   || '';

  if (periodVal) {
    const parts = periodVal.split('|');
    _statusPeriodFilter = { label: parts[0], year: parts[1] || '' };
  } else {
    _statusPeriodFilter = { label: '', year: '' };
  }
  _statusUserFilter = userVal;

  if (userVal) {
    // 특정 직원 선택 → 해당 직원의 전체(또는 선택 기간) 평가 이력 표시
    renderUserAllPeriods(userVal, periodVal);
  } else {
    renderAdmStatus();
  }
}

function clearStatusFilter() {
  _statusPeriodFilter = { label: '', year: '' };
  _statusUserFilter   = '';
  renderAdmStatus();
}
```

### 3-4. renderUserAllPeriods 함수 추가

```javascript
async function renderUserAllPeriods(userId, periodFilter) {
  const el = document.getElementById('adm-status');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const [allEvs, periods, users] = await Promise.all([
      API.get('/evals'),
      API.get('/eval-periods'),
      API.get('/users'),
    ]);
    const u = users.find(x => String(x.id) === String(userId));
    if (!u) { el.innerHTML = '<div class="alert alert-red">직원을 찾을 수 없습니다.</div>'; return; }

    // 해당 직원의 eval 목록
    let myEvs = allEvs.filter(e => String(e.user_id) === String(userId));

    // 기간 필터 적용
    if (periodFilter) {
      const [pLabel, pYear] = periodFilter.split('|');
      myEvs = myEvs.filter(e => e.period_label === pLabel && e.eval_year === pYear);
    }

    const phaseLabel = {
      none:'평가없음', draft:'작성중', pending:'승인대기',
      approved:'목표확정', rejected:'반려됨',
      final_self:'자기평가중', final_mgr_pending:'상사평가대기', final_done:'평가완료'
    };
    const phaseCls = {
      none:'bd-draft', draft:'bd-draft', pending:'bd-pending',
      approved:'bd-approved', rejected:'bd-rejected',
      final_self:'bd-fb', final_mgr_pending:'bd-final', final_done:'bd-locked'
    };

    const wrap = document.createElement('div');

    // 뒤로 가기 + 직원 정보
    const hd = document.createElement('div');
    hd.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap';
    hd.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="clearStatusFilter()">← 전체 목록</button>
      <div>
        <span style="font-size:16px;font-weight:700">${u.name}</span>
        <span style="font-size:13px;color:var(--muted);margin-left:8px">${u.dept||''} · ${u.title||''}</span>
      </div>
      <span style="font-size:12px;color:var(--muted);margin-left:auto">총 ${myEvs.length}개 평가 기간</span>`;
    wrap.appendChild(hd);

    if (!myEvs.length) {
      const empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML = '<div class="alert alert-orange">해당 기간에 평가 이력이 없습니다.</div>';
      wrap.appendChild(empty);
    } else {
      // 기간별 카드
      myEvs.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '10px';

        const ph = ev.phase || 'none';
        card.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
            <div>
              <span style="font-size:15px;font-weight:600">${ev.period_label||'-'}</span>
              <span class="bd ${ev.period_type==='q'?'bd-q':'bd-h'}" style="margin-left:6px">${ev.period_type==='q'?'분기':'반기'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="bd ${phaseCls[ph]}">${phaseLabel[ph]||ph}</span>
              <button class="btn btn-ghost btn-sm" onclick="renderEvalDetail(${u.id},'${u.name}',${ev.id})">상세 보기</button>
            </div>
          </div>`;

        // 플로우 바
        card.appendChild(flowBar(ph));

        // 간단 통계
        const statsRow = document.createElement('div');
        statsRow.style.cssText = 'display:flex;gap:12px;margin-top:10px;font-size:12px;color:var(--muted)';
        statsRow.innerHTML = `
          <span>제출일: ${ev.submitted_at?.slice(0,10)||'-'}</span>
          <span>승인일: ${ev.approved_at?.slice(0,10)||'-'}</span>`;
        card.appendChild(statsRow);

        wrap.appendChild(card);
      });
    }

    el.innerHTML = '';
    el.appendChild(wrap);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}
```

### 3-5. 전직원 조회 시 멀티 기간 표시

renderAdmStatus의 부서별 테이블에서 기간 필터 없을 때
직원별로 여러 기간이 있으면 최신 1개만 아니라 모든 기간을 보여주도록:

기간 필터 없을 때 테이블의 기간 컬럼 셀을 아래처럼 수정:
```javascript
// 기간 필터 없을 때 — 직원의 모든 기간 표시
`<td style="font-size:11px">
  ${u.period_label !== '-'
    ? `<div>${u.period_label}</div>
       <button class="btn btn-ghost" style="font-size:10px;padding:1px 6px;margin-top:2px"
         onclick="event.stopPropagation();_statusUserFilter='${u.id}';renderUserAllPeriods('${u.id}','')">
         전체 이력 ▶
       </button>`
    : '<span style="color:var(--muted)">미시작</span>'}
</td>`
```

---

## 작업 4 — 평가 정책 설정 개선 (admin.js + server/index.js)

### 4-1. server/index.js — 피드백 횟수 설정 API 추가

기존 /api/settings/history-visibility 라우트 바로 아래에 추가:

```javascript
// 중간 피드백 횟수 제한 설정
app.get('/api/settings/feedback-limit', auth, (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='feedback_limit'").get();
    res.json({ limit: row ? parseInt(row.value) : 0 }); // 0 = 무제한
  } catch(e) { res.json({ limit: 0 }); }
});

app.post('/api/settings/feedback-limit', auth, adminOnly, (req, res) => {
  try {
    const { limit } = req.body;
    const val = String(parseInt(limit) || 0);
    const exists = db.prepare("SELECT 1 FROM app_settings WHERE key='feedback_limit'").get();
    if (exists) db.prepare("UPDATE app_settings SET value=? WHERE key='feedback_limit'").run(val);
    else db.prepare("INSERT INTO app_settings(key,value) VALUES(?,?)").run('feedback_limit', val);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 비활성 기간 이력 공개 설정
app.get('/api/settings/history-inactive', auth, (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='history_inactive'").get();
    res.json({ enabled: row ? row.value === '1' : false }); // 기본: 비활성 기간 숨김
  } catch(e) { res.json({ enabled: false }); }
});

app.post('/api/settings/history-inactive', auth, adminOnly, (req, res) => {
  try {
    const { enabled } = req.body;
    const val = enabled ? '1' : '0';
    const exists = db.prepare("SELECT 1 FROM app_settings WHERE key='history_inactive'").get();
    if (exists) db.prepare("UPDATE app_settings SET value=? WHERE key='history_inactive'").run(val);
    else db.prepare("INSERT INTO app_settings(key,value) VALUES(?,?)").run('history_inactive', val);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

### 4-2. 피드백 횟수 제한 서버 적용

POST /api/feedback/:evalId 라우트에서 제출 전 횟수 체크 추가:

```javascript
// 기존 라우트 시작 부분에 추가
const limitRow = db.prepare("SELECT value FROM app_settings WHERE key='feedback_limit'").get();
const feedbackLimit = limitRow ? parseInt(limitRow.value) : 0;
if (feedbackLimit > 0) {
  const myFbCount = db.prepare(
    'SELECT COUNT(*) as c FROM feedbacks WHERE eval_id=? AND author_id=?'
  ).get(req.params.evalId, req.user.sub)?.c || 0;
  if (myFbCount >= feedbackLimit) {
    return res.status(429).json({ error: `피드백은 최대 ${feedbackLimit}회까지 가능합니다. (현재 ${myFbCount}회)` });
  }
}
```

### 4-3. admin.js — renderAdmPolicy 함수 교체

기존 renderAdmPolicy 함수 전체를 아래로 교체:

```javascript
async function renderAdmPolicy() {
  const el = document.getElementById('adm-policy');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';

  try {
    const [histVis, histInactive, fbLimit] = await Promise.all([
      API.get('/settings/history-visibility'),
      API.get('/settings/history-inactive'),
      API.get('/settings/feedback-limit'),
    ]);
    _historyVisEnabled = histVis.enabled;

    const limitOptions = [
      { value:0,  label:'무제한' },
      { value:1,  label:'1회' },
      { value:2,  label:'2회' },
      { value:3,  label:'3회' },
      { value:5,  label:'5회' },
      { value:10, label:'10회' },
      { value:20, label:'20회' },
    ];

    el.innerHTML = `<div class="card">
      <div class="card-header"><div>
        <div class="card-header-t">평가 정책 설정</div>
        <div class="card-header-s">전사 평가 운영 정책을 관리합니다</div>
      </div></div>

      <div class="srow">
        <div>
          <div style="font-size:14px;font-weight:500">최종 평가 잠금</div>
          <div style="font-size:12px;color:var(--muted)">확정 후 인사팀 외 수정 불가</div>
        </div>
        <span class="bd bd-locked">항상 잠금</span>
      </div>

      <div class="srow">
        <div>
          <div style="font-size:14px;font-weight:500">중간 피드백 횟수 제한</div>
          <div style="font-size:12px;color:var(--muted)">승인자별 피드백 제출 가능 횟수 (무제한 = 0)</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <select id="fb-limit-sel" style="height:32px;font-size:13px">
            ${limitOptions.map(o =>
              `<option value="${o.value}" ${fbLimit.limit===o.value?'selected':''}>${o.label}</option>`
            ).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="saveFbLimit()">저장</button>
        </div>
      </div>

      <div class="srow">
        <div>
          <div style="font-size:14px;font-weight:500">1차 상사 피드백</div>
          <div style="font-size:12px;color:var(--muted)">1차 직속 상사는 피드백 의무, 2차 이상은 선택</div>
        </div>
        <span class="bd bd-approved">의무/선택 분리 적용 중</span>
      </div>

      <div class="srow">
        <div>
          <div style="font-size:14px;font-weight:500">직원 목표승인 이력 공개</div>
          <div style="font-size:12px;color:var(--muted)">직원이 본인의 과거 승인/반려 이력 열람 허용</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span id="hist-vis-status" class="bd ${histVis.enabled?'bd-approved':'bd-rejected'}">${histVis.enabled?'켜짐':'꺼짐'}</span>
          <button class="btn btn-ghost btn-sm" onclick="toggleHistoryVisibility()">${histVis.enabled?'끄기':'켜기'}</button>
        </div>
      </div>

      <div class="srow" style="${!histVis.enabled?'opacity:.4;pointer-events:none':''}">
        <div style="padding-left:16px">
          <div style="font-size:13px;font-weight:500">↳ 비활성 기간 이력도 공개</div>
          <div style="font-size:12px;color:var(--muted)">켜짐: 활성/비활성 기간 이력 모두 표시 · 꺼짐: 활성 기간만 표시</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span id="hist-inactive-status" class="bd ${histInactive.enabled?'bd-approved':'bd-rejected'}">${histInactive.enabled?'켜짐 (전체)':'꺼짐 (활성만)'}</span>
          <button class="btn btn-ghost btn-sm" onclick="toggleHistoryInactive()">${histInactive.enabled?'끄기':'켜기'}</button>
        </div>
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

async function saveFbLimit() {
  const sel = document.getElementById('fb-limit-sel');
  if (!sel) return;
  try {
    await API.post('/settings/feedback-limit', { limit: parseInt(sel.value) });
    const label = sel.options[sel.selectedIndex].text;
    showAlert(`피드백 횟수 제한이 "${label}"로 설정되었습니다.`, 'green');
  } catch(e) { showAlert(e.message, 'red'); }
}

async function toggleHistoryInactive() {
  try {
    const cur = await API.get('/settings/history-inactive');
    await API.post('/settings/history-inactive', { enabled: !cur.enabled });
    showAlert(!cur.enabled ? '비활성 기간 이력도 공개됩니다.' : '활성 기간 이력만 공개됩니다.', 'green');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

1. "개발 이력"에 추가:
```
| 오늘날짜 | 조직도 차트 드래그드롭 개선(위치기반 자동연결선), 중간피드백 UI 및 의무화, 전직원현황 사람별/멀티기간 조회, 정책설정 개선 | Claude Code |
```

2. "API 엔드포인트 목록"에 추가:
```
GET  /api/settings/feedback-limit       피드백 횟수 제한 조회
POST /api/settings/feedback-limit       피드백 횟수 제한 설정 (admin+)
GET  /api/settings/history-inactive     비활성 기간 이력 공개 설정 조회
POST /api/settings/history-inactive     비활성 기간 이력 공개 설정 변경 (admin+)
```

3. "핵심 설계 원칙"에 추가:
```
7. 중간 피드백 의무: 1차 직속 상사는 의무, 2차 이상 승인자는 선택
8. 조직도 차트: 위치 기반 상/하 관계 자동 인식 (위=상위, 아래=하위)
```
