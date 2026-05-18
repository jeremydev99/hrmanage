# Claude Code 작업 지시서 13
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 1 — 조직도 차트 방식 복귀 (admin.js)

### 현재 상황
renderAdmOrg 함수가 목록 방식만 있고 차트 방식 탭 선택이 없음.

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
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
          <button class="btn ${_orgViewMode==='list'?'btn-primary':'btn-ghost'}"
            onclick="_orgViewMode='list';renderAdmOrg()">📋 목록 방식</button>
          <button class="btn ${_orgViewMode==='chart'?'btn-primary':'btn-ghost'}"
            onclick="_orgViewMode='chart';renderAdmOrg()">🏢 차트 방식</button>
          ${_orgViewMode==='chart' ? `
            <button class="btn btn-ghost btn-sm" onclick="autoLayoutOrg()">자동 정렬</button>
            <button class="btn btn-ghost btn-sm" onclick="openOrgFullscreen()">전체화면 🔲</button>
            <button class="btn btn-primary btn-sm" id="org-save-btn"
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
            onclick="showUserEditModal(${u.id},'${u.name}','${(u.dept||'').replace(/'/g,"\\'") }','${(u.grade||'').replace(/'/g,"\\'")}','${(u.title||'').replace(/'/g,"\\'")}')">
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
  const areaId = isFullscreen ? 'org-fs-area' : 'org-view-area';
  const el = document.getElementById(areaId);
  if (!el) return;

  const NODE_W = 130, NODE_H = 70, H_GAP = 40, V_GAP = 90;

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

  const byLevel = {};
  for (let l = 0; l <= maxLevel; l++) byLevel[l] = [];
  users.forEach(u => { (byLevel[levelMap[u.id]] = byLevel[levelMap[u.id]] || []).push(u); });

  const maxCount = Math.max(...Object.values(byLevel).map(g => g.length), 1);
  const canvasW  = Math.max(isFullscreen ? 2000 : 1000, maxCount * (NODE_W + H_GAP) + 200);
  const canvasH  = Math.max(isFullscreen ? 1200 : 600, (maxLevel + 1) * (NODE_H + V_GAP) + 100);

  for (let l = 0; l <= maxLevel; l++) {
    const group  = byLevel[l] || [];
    const groupW = group.length * (NODE_W + H_GAP) - H_GAP;
    const startX = (canvasW - groupW) / 2;
    group.forEach((u, i) => {
      if (!_orgPositions[u.id]) {
        _orgPositions[u.id] = {
          x: startX + i * (NODE_W + H_GAP),
          y: 30 + l * (NODE_H + V_GAP),
        };
      }
    });
  }

  const suffix = isFullscreen ? 'fs' : 'main';
  el.innerHTML = `
    <div id="org-scroll-${suffix}" style="width:100%;height:${isFullscreen?'calc(100vh - 60px)':'480px'};
      overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:8px;position:relative">
      <div id="org-inner-${suffix}" style="position:relative;width:${canvasW}px;height:${canvasH}px">
        <svg id="org-svg-${suffix}" width="${canvasW}" height="${canvasH}"
          style="position:absolute;top:0;left:0;pointer-events:none;z-index:1"></svg>
        <div id="org-nodes-${suffix}" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:2"></div>
      </div>
    </div>`;

  const svgEl   = document.getElementById('org-svg-' + suffix);
  const nodesEl = document.getElementById('org-nodes-' + suffix);
  const scrollEl = document.getElementById('org-scroll-' + suffix);

  function drawLines() {
    if (!svgEl) return;
    svgEl.innerHTML = '';
    // 임시선 재추가
    svgEl.appendChild(tempLine);
    users.forEach(u => {
      if (!u.manager_id || !_orgPositions[u.id] || !_orgPositions[u.manager_id]) return;
      const fp = _orgPositions[u.manager_id], tp = _orgPositions[u.id];
      const x1 = fp.x + NODE_W/2, y1 = fp.y + NODE_H;
      const x2 = tp.x + NODE_W/2, y2 = tp.y;
      const my = (y1 + y2) / 2;
      const g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.style.cssText = 'pointer-events:all;cursor:pointer';
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      path.setAttribute('stroke','var(--o400)');path.setAttribute('stroke-width','2');path.setAttribute('fill','none');
      const hit = document.createElementNS('http://www.w3.org/2000/svg','path');
      hit.setAttribute('d',`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','14');hit.setAttribute('fill','none');
      const arrow = document.createElementNS('http://www.w3.org/2000/svg','polygon');
      arrow.setAttribute('points',`${x2-5},${y2-8} ${x2+5},${y2-8} ${x2},${y2}`);
      arrow.setAttribute('fill','var(--o400)');
      g.appendChild(path);g.appendChild(hit);g.appendChild(arrow);
      g.onmouseenter=()=>{path.setAttribute('stroke','var(--red)');arrow.setAttribute('fill','var(--red)');};
      g.onmouseleave=()=>{path.setAttribute('stroke','var(--o400)');arrow.setAttribute('fill','var(--o400)');};
      g.onclick=async()=>{
        const mName=users.find(x=>String(x.id)===String(u.manager_id))?.name||'';
        if(!confirm(`${u.name} → ${mName} 연결을 해제하시겠습니까?`))return;
        try{await API.patch('/users/'+u.id,{manager_id:null});u.manager_id=null;drawLines();showAlert(u.name+'의 상위관리자 연결 해제','green');}
        catch(e){showAlert(e.message,'red');}
      };
      svgEl.appendChild(g);
    });
  }

  const tempLine = document.createElementNS('http://www.w3.org/2000/svg','path');
  tempLine.setAttribute('stroke','var(--o400)');tempLine.setAttribute('stroke-width','2');
  tempLine.setAttribute('stroke-dasharray','6,3');tempLine.setAttribute('fill','none');
  tempLine.style.display='none';tempLine.style.pointerEvents='none';
  svgEl.appendChild(tempLine);

  let dragState=null, lineState=null;

  users.forEach(u => {
    const pos = _orgPositions[u.id]||{x:20,y:20};
    const node = document.createElement('div');
    node.id = 'orgnode-'+suffix+'-'+u.id;
    node.dataset.uid = u.id;
    node.style.cssText=`position:absolute;left:${pos.x}px;top:${pos.y}px;width:${NODE_W}px;height:${NODE_H}px;
      background:var(--white);border:2px solid var(--o200);border-radius:10px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:4px 6px;cursor:grab;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,.08);`;
    node.innerHTML=`
      <div style="font-size:12px;font-weight:600;color:var(--o800);text-align:center">${u.name}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:1px;text-align:center">${u.grade||''} ${u.title||''}</div>
      <div style="font-size:10px;color:var(--muted);text-align:center">${u.dept||''}</div>
      <div class="org-dot" data-uid="${u.id}"
        style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);
          width:14px;height:14px;border-radius:50%;background:var(--o400);border:2px solid #fff;cursor:crosshair;z-index:10"
        title="드래그하여 상위관리자 연결"></div>`;

    node.addEventListener('mousedown',e=>{
      if(e.target.classList.contains('org-dot'))return;
      dragState={uid:u.id,node,startX:e.clientX,startY:e.clientY,origX:_orgPositions[u.id]?.x||0,origY:_orgPositions[u.id]?.y||0};
      node.style.zIndex=50;node.style.cursor='grabbing';e.preventDefault();
    });
    node.querySelector('.org-dot').addEventListener('mousedown',e=>{
      e.stopPropagation();
      const p=_orgPositions[u.id];
      lineState={fromUid:u.id,fromX:p.x+NODE_W/2,fromY:p.y+NODE_H};
      tempLine.style.display='';e.preventDefault();
    });
    nodesEl.appendChild(node);
  });
  drawLines();

  function onMove(e){
    const iRect=document.getElementById('org-inner-'+suffix)?.getBoundingClientRect();if(!iRect)return;
    const mx=e.clientX-iRect.left,my=e.clientY-iRect.top;
    if(dragState){
      const nx=Math.max(0,dragState.origX+(e.clientX-dragState.startX));
      const ny=Math.max(0,dragState.origY+(e.clientY-dragState.startY));
      _orgPositions[dragState.uid]={x:nx,y:ny};
      dragState.node.style.left=nx+'px';dragState.node.style.top=ny+'px';
      drawLines();
      _orgUnsaved=true;
      const sb=document.getElementById('org-save-btn');if(sb)sb.style.opacity='1';
    }
    if(lineState){
      const x1=lineState.fromX,y1=lineState.fromY,mid=(y1+my)/2;
      tempLine.setAttribute('d',`M${x1},${y1} C${x1},${mid} ${mx},${mid} ${mx},${my}`);
      users.forEach(u=>{
        const n=document.getElementById('orgnode-'+suffix+'-'+u.id);if(!n)return;
        const p=_orgPositions[u.id];
        const inBox=mx>=p.x&&mx<=p.x+NODE_W&&my>=p.y&&my<=p.y+NODE_H;
        n.style.borderColor=(inBox&&String(u.id)!==String(lineState.fromUid))?'var(--green)':'var(--o200)';
      });
    }
  }

  async function onUp(e){
    const iRect=document.getElementById('org-inner-'+suffix)?.getBoundingClientRect();if(!iRect)return;
    const mx=e.clientX-iRect.left,my=e.clientY-iRect.top;
    if(dragState){dragState.node.style.zIndex='';dragState.node.style.cursor='grab';dragState=null;}
    if(lineState){
      tempLine.style.display='none';tempLine.setAttribute('d','');
      users.forEach(u=>{const n=document.getElementById('orgnode-'+suffix+'-'+u.id);if(n)n.style.borderColor='var(--o200)';});
      let dropUid=null;
      users.forEach(u=>{
        if(String(u.id)===String(lineState.fromUid))return;
        const p=_orgPositions[u.id];
        if(mx>=p.x&&mx<=p.x+NODE_W&&my>=p.y&&my<=p.y+NODE_H)dropUid=u.id;
      });
      if(dropUid){
        let check=users.find(x=>String(x.id)===String(dropUid));
        let circular=false,depth=0;
        while(check?.manager_id&&depth<10){if(String(check.manager_id)===String(lineState.fromUid)){circular=true;break;}check=users.find(x=>String(x.id)===String(check.manager_id));depth++;}
        if(circular){showAlert('순환 참조가 발생합니다.','red');}
        else{
          const fromPos=_orgPositions[lineState.fromUid],dropPos=_orgPositions[dropUid];
          let childUid,parentUid;
          if(fromPos.y>dropPos.y){childUid=lineState.fromUid;parentUid=dropUid;}
          else{childUid=dropUid;parentUid=lineState.fromUid;}
          try{
            await API.patch('/users/'+childUid,{manager_id:parentUid});
            const idx=users.findIndex(x=>String(x.id)===String(childUid));
            if(idx!==-1)users[idx].manager_id=parentUid;
            drawLines();
            const cn=users.find(x=>String(x.id)===String(childUid))?.name||'';
            const pn=users.find(x=>String(x.id)===String(parentUid))?.name||'';
            showAlert(`${cn}의 상위관리자 → ${pn}으로 설정되었습니다.`,'green');
          }catch(err){showAlert(err.message,'red');}
        }
      }
      lineState=null;
    }
  }

  scrollEl.addEventListener('mousemove',onMove);
  scrollEl.addEventListener('mouseup',onUp);
  document.addEventListener('mouseup',()=>{
    if(dragState){dragState.node.style.zIndex='';dragState.node.style.cursor='grab';dragState=null;}
    if(lineState){tempLine.style.display='none';lineState=null;
      users.forEach(u=>{const n=document.getElementById('orgnode-'+suffix+'-'+u.id);if(n)n.style.borderColor='var(--o200)';});}
  });
}

function autoLayoutOrg(){_orgPositions={};renderOrgChart(_orgUsers,false);if(document.getElementById('org-fullscreen'))renderOrgChart(_orgUsers,true);}

function saveOrgLayout(){
  try{
    localStorage.setItem('org_positions',JSON.stringify(_orgPositions));
    _orgUnsaved=false;
    showAlert('조직도 배치가 저장되었습니다.','green');
    renderAdmOrg();
  }catch(e){showAlert('저장 실패: '+e.message,'red');}
}

function openOrgFullscreen(){
  if(document.getElementById('org-fullscreen'))return;
  const overlay=document.createElement('div');
  overlay.id='org-fullscreen';
  overlay.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.9);z-index:9999;display:flex;flex-direction:column';
  overlay.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--o500);flex-shrink:0">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="color:#fff;font-size:15px;font-weight:600">조직도 편집 — 전체화면</span>
        <span style="font-size:12px;color:rgba(255,255,255,.7)">박스 드래그: 이동 · 하단 점: 연결 · 선 클릭: 해제</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="_orgPositions={};renderOrgChart(_orgUsers,true)">자동 정렬</button>
        <button class="btn btn-sm" style="background:var(--green);color:#fff;border:none" onclick="saveOrgLayout();closeOrgFullscreen()">💾 저장 후 닫기</button>
        <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="closeOrgFullscreen()">✕ 닫기</button>
      </div>
    </div>
    <div id="org-fs-area" style="flex:1;overflow:hidden;padding:10px"></div>`;
  document.body.appendChild(overlay);
  renderOrgChart(_orgUsers,true);
}

function closeOrgFullscreen(){document.getElementById('org-fullscreen')?.remove();renderOrgChart(_orgUsers,false);}

function showUserEditModal(uid,name,dept,grade,title){
  document.getElementById('user-edit-modal')?.remove();
  const ranks=['사원','대리','과장','차장','부장','이사','상무','전무','부사장','사장','기타'];
  const overlay=document.createElement('div');
  overlay.id='user-edit-modal';
  overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML=`
    <div style="background:var(--white);border-radius:12px;padding:24px;width:100%;max-width:400px;margin:20px">
      <div style="font-size:15px;font-weight:600;margin-bottom:16px">${name} 정보 수정</div>
      <div class="form-group" style="margin-bottom:10px"><label>부서</label><input id="ue-dept" value="${dept||''}" placeholder="예: 개발팀"></div>
      <div class="form-group" style="margin-bottom:10px">
        <label>직급</label>
        <select id="ue-grade-sel" style="height:36px;font-size:13px" onchange="document.getElementById('ue-grade-custom').style.display=this.value==='기타'?'':'none'">
          ${ranks.map(r=>`<option value="${r}" ${grade===r?'selected':''}>${r}</option>`).join('')}
        </select>
        <input id="ue-grade-custom" placeholder="직급 직접 입력" style="margin-top:6px;display:${ranks.includes(grade)?'none':''}" value="${ranks.includes(grade)?'':grade||''}">
      </div>
      <div class="form-group" style="margin-bottom:16px"><label>직책</label><input id="ue-title" value="${title||''}" placeholder="예: 팀장"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('user-edit-modal').remove()">취소</button>
        <button class="btn btn-primary" onclick="saveUserInfo(${uid})">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function saveUserInfo(uid){
  const dept=document.getElementById('ue-dept')?.value.trim()||'';
  const grSel=document.getElementById('ue-grade-sel')?.value||'';
  const grCus=document.getElementById('ue-grade-custom')?.value.trim()||'';
  const grade=grSel==='기타'?grCus:grSel;
  const title=document.getElementById('ue-title')?.value.trim()||'';
  try{await API.patch('/users/'+uid,{dept,grade,title});showAlert('정보가 수정되었습니다.','green');document.getElementById('user-edit-modal')?.remove();renderAdmOrg();}
  catch(e){showAlert(e.message,'red');}
}
```

### 기존 changeManager 함수는 유지 (삭제하지 말 것)

---

## 작업 2 — 과거 목표승인 이력 버튼 수정 (my-eval.js)

### 2-1. toggleHistoryPanel 함수가 없으므로 my-eval.js 끝에 추가:

```javascript
async function toggleHistoryPanel(btn) {
  const panel = document.getElementById('history-panel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  if (!isHidden) {
    panel.style.display = 'none';
    btn.textContent = '펼치기 ▼';
    return;
  }
  btn.textContent = '접기 ▲';
  panel.style.display = 'block';
  panel.innerHTML = '<div class="spinner">로딩 중...</div>';

  try {
    const history = await API.get('/evals/my-history').catch(() => []);
    if (!history || !history.length) {
      panel.innerHTML = '<div class="alert alert-orange">승인 이력이 없습니다.</div>';
      return;
    }

    const phaseLabel = {
      draft:'작성중', pending:'승인대기', approved:'목표확정',
      rejected:'반려됨', final_self:'자기평가중',
      final_mgr_pending:'상사평가대기', final_mgr2_pending:'2차평가대기',
      final_done:'평가완료'
    };
    const phaseCls = {
      draft:'bd-draft', pending:'bd-pending', approved:'bd-approved',
      rejected:'bd-rejected', final_self:'bd-fb',
      final_mgr_pending:'bd-final', final_mgr2_pending:'bd-purple', final_done:'bd-locked'
    };

    panel.innerHTML = history.map(ev => {
      const ph = ev.phase || 'draft';
      return `<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;background:var(--white)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">
          <div>
            <span style="font-size:13px;font-weight:600">${ev.period_label||'-'}</span>
            <span style="font-size:11px;color:var(--muted);margin-left:8px">제출 ${(ev.submitted_at||'').slice(0,10)||'미제출'}</span>
          </div>
          <span class="bd ${phaseCls[ph]||'bd-draft'}">${phaseLabel[ph]||ph}</span>
        </div>
        ${ev.reject_reason ? `<div class="alert alert-red" style="font-size:12px;margin-bottom:8px">반려 사유: ${ev.reject_reason}</div>` : ''}
        ${(ev.goals||[]).length ? `
          <div style="margin-bottom:8px">
            ${(ev.goals||[]).map(g => `
              <div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;border-bottom:1px solid var(--o50)">
                <span style="flex:1;font-weight:500">${g.name||''}</span>
                <span style="color:var(--muted)">${g.kpi||''}</span>
                <span style="background:var(--o100);color:var(--o800);padding:1px 6px;border-radius:8px;font-size:11px">${g.weight}%</span>
              </div>`).join('')}
          </div>` : ''}
        ${(ev.approvals||[]).length ? `
          <div style="border-top:1px solid var(--o100);padding-top:8px">
            <div style="font-size:11px;color:var(--muted);margin-bottom:5px">승인 이력</div>
            ${(ev.approvals||[]).map(a => `
              <div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0">
                <span class="bd ${a.action==='approved'?'bd-approved':'bd-rejected'}" style="font-size:10px">${a.action==='approved'?'승인':'반려'}</span>
                <span style="font-weight:500">${a.approver_name||''} (${a.approver_title||''})</span>
                <span style="color:var(--muted)">${(a.created_at||'').slice(0,10)}</span>
                ${a.note ? `<span style="color:var(--muted)">— ${a.note}</span>` : ''}
              </div>`).join('')}
          </div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    panel.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}
```

### 2-2. server/index.js — /api/evals/my-history API 누락 확인 후 없으면 추가

GET /api/admin/eval-status 라우트 바로 위에 아래 추가
(이미 있으면 건너뜀):

```javascript
// 내 목표 승인 이력 전체 (반려 포함)
app.get('/api/evals/my-history', auth, (req, res) => {
  try {
    const evs = db.prepare(
      "SELECT * FROM eval_cycles WHERE user_id=? ORDER BY created_at DESC"
    ).all(req.user.sub);

    const result = evs.map(ev => {
      const goals = db.prepare(
        `SELECT g.*, c.name as cat_name FROM goals g
         JOIN goal_categories c ON g.category_id=c.id
         WHERE g.eval_id=? ORDER BY c.sort_order, g.sort_order`
      ).all(ev.id).map(g => ({
        ...g,
        name: g.name ? decrypt(g.name) : '',
        kpi:  g.kpi  ? decrypt(g.kpi)  : '',
      }));

      const approvals = db.prepare(
        `SELECT a.*, u.name as approver_name, u.title as approver_title
         FROM goal_approvals a JOIN users u ON a.approver_id=u.id
         WHERE a.eval_id=? ORDER BY a.created_at DESC`
      ).all(ev.id).map(a => ({
        ...a,
        note: a.note ? decrypt(a.note) : '',
      }));

      return {
        ...ev,
        self_reason:   ev.self_reason   ? decrypt(ev.self_reason)   : '',
        reject_reason: ev.reject_reason ? decrypt(ev.reject_reason) : '',
        goals,
        approvals,
      };
    });
    res.json(result);
  } catch(err) {
    console.error('[my-history]', err);
    res.status(500).json({ error: err.message });
  }
});
```

---

## 작업 3 — 최종평가 등급 기준 설정 (server/index.js + admin.js + final-eval.js)

### 3-1. server/index.js — 테이블 및 API 추가

migrations 배열에 추가:
```javascript
`CREATE TABLE IF NOT EXISTS grade_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_code TEXT NOT NULL,
  grade_name TEXT NOT NULL,
  description TEXT,
  note TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
)`,
```

seedInitialData 함수 안에 기본 등급 기준 시드 추가:
```javascript
const gradeExists = db.prepare('SELECT 1 FROM grade_criteria LIMIT 1').get();
if (!gradeExists) {
  const grades = [
    { code:'OI', name:'OI (Outstanding Impact)',    desc:'조직 전체에 탁월한 영향을 미친 최고 수준의 성과를 달성하였습니다.',    note:'최상위 성과자', sort:1 },
    { code:'EE', name:'EE (Exceeds Expectations)',  desc:'기대 수준을 명확히 초과하는 우수한 성과를 지속적으로 창출하였습니다.',  note:'우수 성과자', sort:2 },
    { code:'SC', name:'SC (Strong Contributor)',    desc:'핵심 목표를 달성하며 팀에 실질적인 기여를 한 성과를 보였습니다.',      note:'우량 기여자', sort:3 },
    { code:'ME', name:'ME (Meets Expectations)',    desc:'설정된 목표와 기대 수준을 충실히 달성한 안정적인 성과를 보였습니다.',   note:'기준 충족', sort:4 },
    { code:'PB', name:'PB (Performance Building)',  desc:'일부 목표를 달성하였으나 전반적인 역량 강화와 성과 개선이 필요합니다.', note:'성과 개선 필요', sort:5 },
    { code:'IR', name:'IR (Improvement Required)',  desc:'주요 목표 달성에 미흡하여 구체적인 개선 계획 수립과 실행이 요구됩니다.',note:'개선 요구', sort:6 },
    { code:'NC', name:'NC (No Contest)',            desc:'평가를 위한 충분한 활동 및 데이터가 확인되지 않아 등급 산정이 불가합니다.',note:'해당 없음', sort:7 },
  ];
  const insGrade = db.prepare(
    'INSERT INTO grade_criteria(grade_code,grade_name,description,note,sort_order) VALUES(?,?,?,?,?)'
  );
  grades.forEach(g => insGrade.run(g.code, g.name, g.desc, g.note, g.sort));
  console.log('✅ 기본 등급 기준 생성 완료');
}
```

GET /api/admin/eval-status 라우트 위에 등급 기준 API 추가:
```javascript
// ── 등급 기준 API ─────────────────────────────────────────
app.get('/api/grade-criteria', auth, (req, res) => {
  try {
    const grades = db.prepare(
      'SELECT * FROM grade_criteria WHERE is_active=1 ORDER BY sort_order'
    ).all();
    res.json(grades);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/grade-criteria', auth, adminOnly, (req, res) => {
  try {
    const { grade_code, grade_name, description, note } = req.body;
    if (!grade_code || !grade_name) return res.status(400).json({ error: '등급 코드와 명칭은 필수입니다.' });
    const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM grade_criteria').get()?.m || 0;
    const r = db.prepare(
      'INSERT INTO grade_criteria(grade_code,grade_name,description,note,sort_order) VALUES(?,?,?,?,?)'
    ).run(grade_code, grade_name, description||'', note||'', maxSort+1);
    res.json({ id: r.lastInsertRowid });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/grade-criteria/:id', auth, adminOnly, (req, res) => {
  try {
    const { grade_code, grade_name, description, note, is_active } = req.body;
    db.prepare(
      'UPDATE grade_criteria SET grade_code=?,grade_name=?,description=?,note=?,is_active=? WHERE id=?'
    ).run(grade_code, grade_name, description||'', note||'', is_active??1, req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/grade-criteria/:id', auth, masterOnly, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM grade_criteria WHERE is_active=1').get()?.c||0;
    if (total <= 2) return res.status(400).json({ error: '최소 2개 이상의 등급이 필요합니다.' });
    db.prepare('UPDATE grade_criteria SET is_active=0 WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

### 3-2. admin.js — 관리자 탭에 등급 기준 관리 추가

Pages.admin stabs에 탭 추가:
```html
<button class="stb" id="stb-adm-grades" onclick="switchAdmTab('adm-grades')">등급 기준</button>
<div class="sp" id="adm-grades"></div>
```

switchAdmTab에 추가:
```javascript
if (id === 'adm-grades') renderAdmGrades();
```

renderAdmGrades 함수 추가:
```javascript
async function renderAdmGrades() {
  const el = document.getElementById('adm-grades'); if(!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const grades = await API.get('/grade-criteria');
    el.innerHTML = `<div class="card">
      <div class="card-header"><div>
        <div class="card-header-t">최종평가 등급 기준 관리</div>
        <div class="card-header-s">최소 2개 이상 설정 필요 · 최종평가 시 평가자가 이 기준에서 선택합니다</div>
      </div></div>

      <!-- 기존 등급 목록 -->
      <table class="tbl" style="margin-bottom:16px">
        <thead><tr>
          <th style="width:120px">등급 코드</th>
          <th>등급 명칭</th>
          <th>설명</th>
          <th style="width:100px">비고</th>
          <th style="width:80px"></th>
        </tr></thead>
        <tbody>
          ${grades.map(g => `<tr>
            <td><input id="gc-code-${g.id}" value="${g.grade_code}" style="width:100%;font-size:12px;height:28px"></td>
            <td><input id="gc-name-${g.id}" value="${g.grade_name}" style="width:100%;font-size:12px;height:28px"></td>
            <td><input id="gc-desc-${g.id}" value="${g.description||''}" style="width:100%;font-size:12px;height:28px" placeholder="등급 설명"></td>
            <td><input id="gc-note-${g.id}" value="${g.note||''}" style="width:100%;font-size:12px;height:28px" placeholder="비고"></td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="saveGrade(${g.id})">저장</button>
                ${App.isMaster()?`<button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;padding:3px 6px;font-size:11px" onclick="deleteGrade(${g.id})">삭제</button>`:''}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>

      <!-- 새 등급 추가 -->
      <div style="background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:14px">
        <div style="font-size:13px;font-weight:500;margin-bottom:10px;color:var(--o800)">새 등급 추가</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="new-gc-code" placeholder="등급 코드 (예: OI)" style="flex:0 0 100px;height:34px;font-size:13px">
          <input id="new-gc-name" placeholder="등급 명칭" style="flex:2;min-width:150px;height:34px;font-size:13px">
          <input id="new-gc-desc" placeholder="등급 설명" style="flex:3;min-width:200px;height:34px;font-size:13px">
          <input id="new-gc-note" placeholder="비고" style="flex:1;min-width:80px;height:34px;font-size:13px">
          <button class="btn btn-primary" style="height:34px" onclick="addGrade()">+ 추가</button>
        </div>
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

async function saveGrade(id) {
  try {
    await API.put('/grade-criteria/' + id, {
      grade_code:  document.getElementById('gc-code-'+id)?.value.trim(),
      grade_name:  document.getElementById('gc-name-'+id)?.value.trim(),
      description: document.getElementById('gc-desc-'+id)?.value.trim(),
      note:        document.getElementById('gc-note-'+id)?.value.trim(),
      is_active: 1,
    });
    showAlert('저장되었습니다.', 'green');
  } catch(e) { showAlert(e.message, 'red'); }
}

async function deleteGrade(id) {
  if (!confirm('이 등급을 비활성화하시겠습니까?')) return;
  try {
    await API.del('/grade-criteria/' + id);
    showAlert('삭제되었습니다.', 'green');
    renderAdmGrades();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function addGrade() {
  try {
    await API.post('/grade-criteria', {
      grade_code:  document.getElementById('new-gc-code')?.value.trim(),
      grade_name:  document.getElementById('new-gc-name')?.value.trim(),
      description: document.getElementById('new-gc-desc')?.value.trim(),
      note:        document.getElementById('new-gc-note')?.value.trim(),
    });
    showAlert('새 등급이 추가되었습니다.', 'green');
    renderAdmGrades();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

### 3-3. final-eval.js — 상사 최종평가에 등급 선택 추가

renderFinalMgr 함수에서 bottomSection(종합 의견 + 제출 버튼) 부분의
textarea 위에 등급 선택 드롭다운 추가:

```javascript
// grades 로드 (renderFinalMgr 함수 시작부에서 Promise.all에 추가)
const [goals, fe, fbs, grades] = await Promise.all([
  API.get(`/evals/${ev.id}/goals`),
  API.get(`/final/${ev.id}`),
  API.get(`/feedback/${ev.id}`),
  API.get('/grade-criteria'),
]);
```

bottomSection.innerHTML의 textarea 위에 등급 선택 추가:
```javascript
bottomSection.innerHTML = `
  <div style="margin-top:12px">
    <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">
      최종 등급 선택 <span style="color:var(--red)">*</span>
    </label>
    <select id="fin-grade-sel-${ev.id}" style="width:100%;height:38px;font-size:13px;margin-bottom:10px">
      <option value="">— 등급을 선택하세요 —</option>
      ${grades.map(g => `
        <option value="${g.grade_code}" title="${g.description||''}">
          ${g.grade_name} ${g.note?'('+g.note+')':''}
        </option>`).join('')}
    </select>
    ${grades.length ? `
    <div id="fin-grade-desc-${ev.id}" style="font-size:12px;color:var(--muted);padding:6px 10px;background:var(--o50);border-radius:6px;margin-bottom:10px;display:none"></div>` : ''}
  </div>
  <div style="margin-top:4px">
    <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">상사 종합 의견</label>
    <textarea id="fin-mgr-note-${ev.id}" placeholder="성과 총평 및 향후 육성 방향을 작성하세요..."
      style="width:100%;min-height:80px;resize:vertical"></textarea>
  </div>
  <div class="abar">
    <button class="btn btn-purple" onclick="submitFinalMgr(${ev.id},${ev.is_second||0})">
      ${ev.is_second?'2차 최종평가 제출':'최종 평가 확정 — 잠금 처리됩니다'}
    </button>
  </div>`;

// 등급 선택 시 설명 표시
setTimeout(() => {
  const sel = document.getElementById(`fin-grade-sel-${ev.id}`);
  const descEl = document.getElementById(`fin-grade-desc-${ev.id}`);
  if (sel && descEl) {
    sel.addEventListener('change', () => {
      const selected = grades.find(g => g.grade_code === sel.value);
      if (selected?.description) {
        descEl.textContent = selected.description;
        descEl.style.display = 'block';
      } else {
        descEl.style.display = 'none';
      }
    });
  }
}, 100);
```

submitFinalMgr 함수에서 등급 선택 값 수집 및 검증 추가:
```javascript
// 기존 submitFinalMgr 함수에서 1차 평가 제출 부분에 추가
const selectedGrade = document.getElementById(`fin-grade-sel-${evalId}`)?.value;
if (!isSecond && !selectedGrade) {
  showAlert('최종 등급을 선택해주세요.', 'orange');
  return;
}
// API 호출 시 selected_grade 추가
const res = await API.post(`/final/${evalId}/mgr`, {
  mgr_note: note,
  scores,
  selected_grade: selectedGrade,  // 추가
});
```

server/index.js POST /api/final/:evalId/mgr 에서
selected_grade 처리 추가:
```javascript
// req.body에서 selected_grade 추출
const { mgr_note, scores, selected_grade } = req.body;

// final_evaluations UPDATE 시 selected_grade 저장
// grade_criteria 테이블에서 해당 등급의 grade_name 조회
const gradeInfo = selected_grade
  ? db.prepare('SELECT grade_name FROM grade_criteria WHERE grade_code=?').get(selected_grade)
  : null;

// 기존 final_score 기반 grade 대신 selected_grade 우선 사용
const finalGradeCode = selected_grade || grade;
const finalGradeName = gradeInfo?.grade_name || grade;

// UPDATE 쿼리에서 final_grade를 finalGradeCode로 변경
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

1. "개발 이력"에 추가:
```
| 오늘날짜 | 조직도차트방식복귀, 과거이력toggleHistoryPanel추가, 최종평가등급기준관리탭신규 | Claude Code |
```

2. "DB 스키마"에 추가:
```
grade_criteria  id, grade_code, grade_name, description, note, sort_order, is_active
```

3. "API 엔드포인트 목록"에 추가:
```
GET    /api/grade-criteria          등급 기준 목록
POST   /api/grade-criteria          등급 추가 (admin+)
PUT    /api/grade-criteria/:id      등급 수정 (admin+)
DELETE /api/grade-criteria/:id      등급 비활성화 (master)
GET    /api/evals/my-history        내 목표 승인 이력
```
