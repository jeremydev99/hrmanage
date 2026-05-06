Pages.admin = async function() {
  if (!App.isAdmin()) {
    document.getElementById('main-area').innerHTML = '<div class="alert alert-red">접근 권한이 없습니다.</div>';
    return;
  }

  // 가입 신청 대기 수 확인
  let pendingCount = 0;
  try {
    const reqs = await API.get('/users/signup-requests');
    pendingCount = reqs.filter(r => r.account_status === 'pending').length;
  } catch(e) {}

  const area = document.getElementById('main-area');
  area.innerHTML = `
    <div class="stabs">
      <button class="stb active" id="stb-adm-accounts" onclick="switchAdmTab('adm-accounts')">계정 승인 관리${pendingCount > 0 ? ` <span class="cnt">${pendingCount}</span>` : ''}</button>
      <button class="stb"        id="stb-adm-status"   onclick="switchAdmTab('adm-status')">전직원 평가 현황</button>
      <button class="stb"        id="stb-adm-cat"      onclick="switchAdmTab('adm-cat')">목표 카테고리</button>
      <button class="stb"        id="stb-adm-periods"  onclick="switchAdmTab('adm-periods')">평가 기간 관리</button>
      <button class="stb"        id="stb-adm-org"      onclick="switchAdmTab('adm-org')">조직도 관리</button>
      <button class="stb"        id="stb-adm-roles"    onclick="switchAdmTab('adm-roles')">권한 관리</button>
      <button class="stb"        id="stb-adm-policy"  onclick="switchAdmTab('adm-policy')">평가 정책</button>
      <button class="stb"        id="stb-adm-grades"  onclick="switchAdmTab('adm-grades')">평가 등급</button>
      <button class="stb"        id="stb-adm-audit"   onclick="switchAdmTab('adm-audit')">감사 로그</button>
    </div>
    <div class="sp active" id="adm-accounts"></div>
    <div class="sp"        id="adm-status"></div>
    <div class="sp"        id="adm-cat"></div>
    <div class="sp"        id="adm-periods"></div>
    <div class="sp"        id="adm-org"></div>
    <div class="sp"        id="adm-roles"></div>
    <div class="sp"        id="adm-policy"></div>
    <div class="sp"        id="adm-grades"></div>
    <div class="sp"        id="adm-audit"></div>`;
  renderAdmAccounts();
};

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
    const reqs    = Array.isArray(signupReqs) ? signupReqs : [];
    const users   = Array.isArray(allUsers)   ? allUsers   : [];
    const pending  = reqs.filter(r => r.account_status === 'pending');
    const rejected = reqs.filter(r => r.account_status === 'rejected');
    const active   = users.filter(u => u.account_status === 'approved' || !u.account_status);

    el.innerHTML = `
      <!-- 가입 신청 대기 -->
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
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                  <div style="font-size:12px;color:var(--o600);font-weight:500">승인 시 설정</div>
                  <button class="btn btn-ghost btn-sm" id="setup-btn-${u.id}" style="font-size:11px"
                    onclick="enableApproveForm('${u.id}')">⚙ 조직 설정 (선택사항)</button>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;opacity:.5" id="ap-form-${u.id}">
                  <div style="flex:1;min-width:90px">
                    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">부서</label>
                    <input id="ap-dept-${u.id}" value="${u.dept||''}" style="height:32px;font-size:12px" disabled>
                  </div>
                  <div style="flex:1;min-width:90px">
                    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">직급</label>
                    <select id="ap-grade-${u.id}" style="height:32px;font-size:12px;width:100%" disabled>
                      <option value="">선택</option>
                      <option value="사원">사원</option>
                      <option value="대리">대리</option>
                      <option value="과장">과장</option>
                      <option value="차장">차장</option>
                      <option value="부장">부장</option>
                      <option value="이사">이사</option>
                      <option value="상무">상무</option>
                      <option value="전무">전무</option>
                      <option value="부사장">부사장</option>
                      <option value="사장">사장</option>
                    </select>
                  </div>
                  <div style="flex:1;min-width:90px">
                    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">직책</label>
                    <input id="ap-title-${u.id}" value="${u.title||''}" style="height:32px;font-size:12px" disabled>
                  </div>
                  <div style="flex:1;min-width:130px">
                    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">상위 관리자</label>
                    <select id="ap-mgr-${u.id}" style="height:32px;font-size:12px;width:100%" disabled>
                      <option value="">없음</option>
                      ${active.map(a => `<option value="${a.id}">${a.name} (${a.dept||''} ${a.title||''})</option>`).join('')}
                    </select>
                  </div>
                  <div style="flex:1;min-width:100px">
                    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">권한</label>
                    <select id="ap-role-${u.id}" style="height:32px;font-size:12px;width:100%" disabled>
                      <option value="user">일반사용자</option>
                      <option value="admin">일반관리자</option>
                      ${App.isMaster() ? '<option value="master">마스터관리자</option>' : ''}
                    </select>
                  </div>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                  <button class="btn btn-danger btn-sm" onclick="rejectAccount(${u.id})">거절</button>
                  <button class="btn btn-success btn-sm" id="approve-btn-${u.id}"
                    onclick="approveAccount(${u.id})">✓ 승인</button>
                </div>
              </div>
            </div>`).join('')}
      </div>
      <!-- 활성 계정 관리 -->
      <div class="card">
        <div class="card-header"><div>
          <div class="card-header-t">활성 계정 관리
            <span style="background:rgba(255,255,255,.25);padding:2px 8px;border-radius:10px;font-size:12px;margin-left:6px">${active.length}명</span>
          </div>
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
                ? `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="toggleActive(${u.id})">${u.is_active ? '비활성화' : '활성화'}</button>`
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
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

function enableApproveForm(uid) {
  const form = document.getElementById('ap-form-' + uid);
  if (form) form.style.opacity = '1';
  ['ap-dept-','ap-grade-','ap-title-','ap-mgr-','ap-role-'].forEach(prefix => {
    const el = document.getElementById(prefix + uid);
    if (el) el.disabled = false;
  });
  const setupBtn   = document.getElementById('setup-btn-'   + uid);
  const approveBtn = document.getElementById('approve-btn-' + uid);
  if (setupBtn)   { setupBtn.textContent = '✓ 조직 설정됨'; setupBtn.disabled = true; }
  if (approveBtn) { approveBtn.disabled = false; approveBtn.style.opacity = '1'; }
}

async function approveAccount(uid) {
  const dept  = document.getElementById('ap-dept-'+uid)?.value  || '';
  const grade = document.getElementById('ap-grade-'+uid)?.value || '';
  const title = document.getElementById('ap-title-'+uid)?.value || '';
  const mgr   = document.getElementById('ap-mgr-'+uid)?.value   || null;
  const role  = document.getElementById('ap-role-'+uid)?.value  || 'user';
  try {
    await API.post('/users/'+uid+'/approve', { role, dept, grade, title, manager_id: mgr });
    showAlert('계정이 승인되었습니다.', 'green');
    renderAdmAccounts();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function rejectAccount(uid) {
  if (!confirm('이 가입 신청을 거절하시겠습니까?')) return;
  try {
    await API.post('/users/'+uid+'/reject', {});
    showAlert('가입 신청이 거절되었습니다.', 'red');
    renderAdmAccounts();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function reApproveAccount(uid) {
  try {
    await API.post('/users/'+uid+'/approve', { role: 'user' });
    showAlert('계정이 재승인되었습니다.', 'green');
    renderAdmAccounts();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function toggleActive(uid) {
  try {
    const res = await API.post('/users/'+uid+'/toggle-active', {});
    showAlert(res.is_active ? '계정이 활성화되었습니다.' : '계정이 비활성화되었습니다.', res.is_active ? 'green' : 'red');
    renderAdmAccounts();
  } catch(e) { showAlert(e.message, 'red'); }
}

function switchAdmTab(id) {
  document.querySelectorAll('.stb').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.sp').forEach(s=>s.classList.remove('active'));
  document.getElementById('stb-'+id)?.classList.add('active');
  document.getElementById(id)?.classList.add('active');
  if (id==='adm-accounts') renderAdmAccounts();
  if (id==='adm-status')   renderAdmStatus();
  if (id==='adm-cat')      renderAdmCat();
  if (id==='adm-periods')  renderAdmPeriods();
  if (id==='adm-org')      renderAdmOrg();
  if (id==='adm-roles')    renderAdmRoles();
  if (id==='adm-policy')   renderAdmPolicy();
  if (id==='adm-grades')   renderAdmGrades();
  if (id==='adm-audit')    renderAdmAudit();
}

/* ── 카테고리 관리 ── */
let _editCats = [];
async function renderAdmCat() {
  const el = document.getElementById('adm-cat'); if(!el)return;
  _editCats = JSON.parse(JSON.stringify(App.categories));
  rebuildCatUI();
}

function rebuildCatUI() {
  const el = document.getElementById('adm-cat'); if(!el)return;
  const totalW = _editCats.reduce((a,c)=>a+Number(c.weight),0);
  el.innerHTML = `<div class="card">
    <div class="card-header"><div><div class="card-header-t">목표 카테고리 설정</div>
    <div class="card-header-s">직원이 목표를 수립할 카테고리를 설정합니다</div></div></div>
    <div class="alert ${totalW===100?'alert-green':'alert-orange'}" style="font-size:12px">
      카테고리 가중치 합계: <strong>${totalW}%</strong> ${totalW===100?'✓ 정상':'— 합계가 100%여야 합니다'}
    </div>
    ${_editCats.map((cat,i)=>`<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">
          <label style="font-size:11px;color:var(--muted)">카테고리명</label>
          <input value="${cat.name}" onchange="updEditCat(${i},'name',this.value)"
            style="background:${cat.color};color:${cat.text_color};font-weight:600;margin-top:3px">
        </div>
        <div style="width:80px">
          <label style="font-size:11px;color:var(--muted)">가중치</label>
          <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
            <input type="number" min="1" max="100" value="${cat.weight}" onchange="updEditCat(${i},'weight',this.value)" style="width:56px">
            <span style="font-size:13px">%</span>
          </div>
        </div>
        <div style="flex:2;min-width:160px">
          <label style="font-size:11px;color:var(--muted)">설명</label>
          <input value="${cat.description||''}" onchange="updEditCat(${i},'description',this.value)" placeholder="카테고리 설명" style="margin-top:3px">
        </div>
        ${_editCats.length>1?`<button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;margin-top:20px" onclick="delEditCat(${i})">삭제</button>`:''}
      </div>
    </div>`).join('')}
    <button class="btn btn-ghost" style="width:100%;margin-bottom:12px" onclick="addEditCat()">+ 카테고리 추가</button>
    <div class="abar"><button class="btn btn-primary" onclick="saveCats()">저장</button></div>
  </div>`;
}

function updEditCat(i, field, val) {
  _editCats[i][field] = field==='weight' ? Math.max(0,Math.min(100,parseInt(val)||0)) : val;
  const totalW = _editCats.reduce((a,c)=>a+Number(c.weight),0);
  const alertEl = document.querySelector('#adm-cat .alert');
  if (alertEl) {
    alertEl.className = `alert ${totalW===100?'alert-green':'alert-orange'}`;
    alertEl.innerHTML = `카테고리 가중치 합계: <strong>${totalW}%</strong> ${totalW===100?'✓ 정상':'— 합계가 100%여야 합니다'}`;
  }
}
function addEditCat() { _editCats.push({name:'새 카테고리',description:'',weight:0,color:'#F1EFE8',text_color:'#444441'}); rebuildCatUI(); }
function delEditCat(i) { if(_editCats.length<=1){showAlert('최소 1개 이상 필요합니다.','orange');return;} _editCats.splice(i,1); rebuildCatUI(); }

async function saveCats() {
  const totalW = _editCats.reduce((a,c)=>a+Number(c.weight),0);
  if (totalW !== 100) { showAlert('가중치 합계가 100%여야 합니다. 현재: '+totalW+'%','orange'); return; }
  try {
    for (const cat of _editCats) {
      if (cat.id) await API.put(`/categories/${cat.id}`, cat);
      else await API.post('/categories', cat);
    }
    App.categories = await API.get('/categories');
    showAlert('카테고리가 저장되었습니다!','green');
    renderAdmCat();
  } catch(e) { showAlert(e.message,'red'); }
}

/* ── 조직도 관리 ── */
let _orgViewMode = localStorage.getItem('orgViewMode') || 'list';
let _orgChartCtrl = null; // AbortController for chart event listeners

async function renderAdmOrg() {
  const el = document.getElementById('adm-org'); if(!el) return;
  if (_orgChartCtrl) { _orgChartCtrl.abort(); _orgChartCtrl = null; }
  const users = await API.get('/users');
  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn btn-sm ${_orgViewMode==='list'?'btn-purple':'btn-ghost'}" onclick="_setOrgView('list')">📋 목록 방식</button>
      <button class="btn btn-sm ${_orgViewMode==='chart'?'btn-purple':'btn-ghost'}" onclick="_setOrgView('chart')">🏢 차트 방식</button>
    </div>
    <div id="org-view-area"></div>`;
  const area = document.getElementById('org-view-area');
  if (_orgViewMode === 'chart') _renderOrgChart(users, area);
  else _renderOrgList(users, area);
}

function _setOrgView(mode) {
  _orgViewMode = mode;
  localStorage.setItem('orgViewMode', mode);
  renderAdmOrg();
}

/* ── 목록 방식 ── */
function _renderOrgList(users, el) {
  const roots = users.filter(u=>!u.manager_id);
  function nodeHtml(u, depth) {
    const children = users.filter(x=>String(x.manager_id)===String(u.id));
    const approvers = [];
    let cur = users.find(x=>String(x.id)===String(u.manager_id));
    let lv=0;
    while(cur&&lv<5){approvers.push(`${++lv}차 ${cur.name}`);cur=users.find(x=>String(x.id)===String(cur.manager_id));}
    return `<div class="org-node">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="avatar" style="background:var(--o100);color:var(--o800)">${u.name.slice(0,2)}</div>
        <div style="flex:1">
          <div style="font-weight:500">${u.name} ${roleBadge(u.role)}</div>
          <div style="font-size:12px;color:var(--muted)">${u.dept||''} · ${u.title||''}
            ${approvers.length?`<span style="color:var(--teal);margin-left:6px">승인자: ${approvers.join(', ')}</span>`:''}
          </div>
        </div>
        <select style="font-size:12px;height:30px;width:130px" onchange="changeManager('${u.id}',this.value)">
          <option value="">상위없음</option>
          ${users.filter(x=>String(x.id)!==String(u.id)).map(x=>`<option value="${x.id}" ${String(u.manager_id)===String(x.id)?'selected':''}>${x.name}</option>`).join('')}
        </select>
      </div>
      ${children.length?`<div class="org-children">${children.map(c=>nodeHtml(c,depth+1)).join('')}</div>`:''}
    </div>`;
  }
  el.innerHTML = `<div class="card">
    <div class="card-header"><div><div class="card-header-t">조직도 관리</div>
    <div class="card-header-s">상위 관리자 변경 시 승인 체계가 자동으로 반영됩니다</div></div></div>
    <div class="alert alert-orange" style="font-size:12px">상위 관리자를 변경하면 해당 직원의 승인 단계가 자동으로 갱신됩니다.</div>
    ${roots.map(u=>nodeHtml(u,0)).join('')}
  </div>`;
}

/* ── 차트 방식 ── */
function _renderOrgChart(users, el) {
  const NODE_W = 164;
  let positions = JSON.parse(localStorage.getItem('orgChartLayout')||'{}');
  // 저장된 위치가 없는 사용자가 있으면 자동 레이아웃 실행
  if (users.some(u => !positions[String(u.id)])) positions = _orgAutoLayout(users);

  el.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-ghost btn-sm" onclick="_orgAutoArrange()">⚡ 자동 정렬</button>
      <button class="btn btn-ghost btn-sm" onclick="_orgSaveLayout()">💾 배치 저장</button>
      <button class="btn btn-ghost btn-sm" onclick="_orgFullscreen()">⛶ 전체화면</button>
      <span style="font-size:11px;color:var(--muted);margin-left:4px">
        노드 드래그=이동 · 하단 점 드래그=상위 연결 · 연결선 클릭=해제
      </span>
    </div>`;

  const wrap = document.createElement('div');
  wrap.id = 'org-chart-wrap';
  wrap.style.cssText = 'position:relative;width:100%;height:620px;border:1px solid var(--border);border-radius:8px;overflow:auto;background:#f8f9fa';

  // 연결선 SVG — pointer-events:none은 SVG 전체가 아닌 가시선에만 적용
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.id = 'org-chart-svg';
  svg.style.cssText = 'position:absolute;top:0;left:0;width:3000px;height:3000px;overflow:visible;z-index:5';
  wrap.appendChild(svg);

  // 드래그 미리보기 SVG
  const svgDrag = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svgDrag.id = 'org-chart-svg-drag';
  svgDrag.style.cssText = 'position:absolute;top:0;left:0;width:3000px;height:3000px;overflow:visible;pointer-events:none;z-index:9';
  wrap.appendChild(svgDrag);

  // 노드 생성 (비활성 사용자 포함 전체 표시)
  users.forEach(u => {
    const pos = positions[String(u.id)] || { x: 50, y: 50 };
    const node = document.createElement('div');
    node.id = `org-node-${u.id}`;
    node.dataset.userId = String(u.id);
    // 높이를 명시(72px)해서 연결선 좌표 계산이 일관되도록
    node.style.cssText = `position:absolute;left:${pos.x}px;top:${pos.y}px;width:${NODE_W}px;height:72px;
      background:${u.is_active===0?'#f9f9f9':'white'};
      border:2px solid ${u.is_active===0?'var(--border)':'var(--o200)'};
      border-radius:8px;padding:8px 10px;
      cursor:move;z-index:10;box-shadow:0 2px 6px rgba(0,0,0,.1);
      user-select:none;box-sizing:border-box;overflow:hidden`;
    node.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;height:100%">
        <div class="avatar" style="width:26px;height:26px;min-width:26px;font-size:10px;
          background:var(--o100);color:var(--o800);flex-shrink:0">${(u.name||'?').slice(0,2)}</div>
        <div style="min-width:0;flex:1">
          <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${u.name||''}${u.is_active===0?' <span style="font-size:9px;color:var(--muted)">(비활성)</span>':''}
          </div>
          <div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${[u.dept,u.grade,u.title].filter(Boolean).join(' · ')||'—'}
          </div>
        </div>
      </div>
      <div class="org-dot" data-from="${u.id}"
        style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);
               width:13px;height:13px;border-radius:50%;background:var(--o400);
               border:2px solid white;cursor:crosshair;z-index:20;
               box-shadow:0 1px 4px rgba(0,0,0,.2)"></div>`;
    wrap.appendChild(node);
  });

  el.appendChild(wrap);
  // DOM 렌더링 후 연결선 그리기 (offsetHeight 사용을 위해 약간 대기)
  setTimeout(() => { _drawOrgLines(users); _setupOrgChartEvents(users, positions); }, 80);
}

function _drawOrgLines(users) {
  const svg  = document.getElementById('org-chart-svg');
  const wrap = document.getElementById('org-chart-wrap');
  if (!svg || !wrap) return;
  svg.innerHTML = '';

  users.filter(u => u.manager_id).forEach(u => {
    const mNode = document.getElementById(`org-node-${u.manager_id}`);
    const uNode = document.getElementById(`org-node-${u.id}`);
    if (!mNode || !uNode) return; // manager_id가 없거나 유효하지 않은 경우 스킵

    // offsetLeft/offsetTop/offsetWidth/offsetHeight로 실제 렌더링 좌표 사용
    const fx = mNode.offsetLeft + mNode.offsetWidth  / 2;
    const fy = mNode.offsetTop  + mNode.offsetHeight;
    const tx = uNode.offsetLeft + uNode.offsetWidth  / 2;
    const ty = uNode.offsetTop;
    const cy = Math.max(40, Math.abs(ty - fy) * 0.5);
    const d  = `M ${fx} ${fy} C ${fx} ${fy+cy} ${tx} ${ty-cy} ${tx} ${ty}`;

    // 가시선: stroke는 style로 설정 (CSS 변수가 attribute에서 미지원될 수 있음)
    const line = document.createElementNS('http://www.w3.org/2000/svg','path');
    line.setAttribute('d', d);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('pointer-events', 'none');
    line.style.stroke = '#F07820';          // var(--o400) 고정값 — SVG 속성에서 CSS 변수 불가
    line.style.strokeWidth = '2px';
    svg.appendChild(line);

    // 클릭 영역 — 넓은 투명 stroke로 클릭 감지
    const mgrName = users.find(x => String(x.id) === String(u.manager_id))?.name || '';
    const hit = document.createElementNS('http://www.w3.org/2000/svg','path');
    hit.setAttribute('d', d);
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke-width', '14');
    hit.setAttribute('pointer-events', 'stroke');
    hit.style.stroke = 'transparent';      // style로 설정해야 pointer-events:stroke와 함께 작동
    hit.style.cursor = 'pointer';
    hit.title = `${mgrName} → ${u.name}  (클릭: 연결 해제)`;
    hit.addEventListener('click', async () => {
      if (!confirm(`[${u.name}]의 상위 관리자(${mgrName}) 연결을 해제할까요?`)) return;
      try {
        await API.patch(`/users/${u.id}`, { manager_id: null });
        showAlert('연결이 해제되었습니다.', 'green');
        renderAdmOrg();
      } catch(e2) { showAlert(e2.message, 'red'); }
    });
    svg.appendChild(hit);
  });
}

function _setupOrgChartEvents(users, positions) {
  if (_orgChartCtrl) _orgChartCtrl.abort();
  _orgChartCtrl = new AbortController();
  const sig  = _orgChartCtrl.signal;
  const wrap = document.getElementById('org-chart-wrap');
  if (!wrap) return;

  let dragNode = null; // { id, ox, oy }
  let dragDot  = null; // { fromId }

  wrap.addEventListener('mousedown', e => {
    const dot = e.target.closest('.org-dot');
    if (dot) { e.preventDefault(); e.stopPropagation(); dragDot = { fromId: dot.dataset.from }; return; }
    const node = e.target.closest('[id^="org-node-"]');
    if (node && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      const nr = node.getBoundingClientRect();
      dragNode = { id: node.dataset.userId, ox: e.clientX - nr.left, oy: e.clientY - nr.top };
    }
  }, { signal: sig });

  document.addEventListener('mousemove', e => {
    if (dragNode) {
      const w = document.getElementById('org-chart-wrap');
      const n = document.getElementById(`org-node-${dragNode.id}`);
      if (!w || !n) return;
      const wr = w.getBoundingClientRect();
      const x  = Math.max(0, e.clientX - wr.left - dragNode.ox + w.scrollLeft);
      const y  = Math.max(0, e.clientY - wr.top  - dragNode.oy + w.scrollTop);
      n.style.left = x + 'px';
      n.style.top  = y + 'px';
      positions[String(dragNode.id)] = { x, y };
      _drawOrgLines(users);
    }
    if (dragDot) {
      const w   = document.getElementById('org-chart-wrap');
      const sdg = document.getElementById('org-chart-svg-drag');
      const fn  = document.getElementById(`org-node-${dragDot.fromId}`);
      if (!w || !sdg || !fn) return;
      const wr = w.getBoundingClientRect();
      const fx = parseInt(fn.style.left) + 80;
      const fy = parseInt(fn.style.top)  + 72;
      const tx = e.clientX - wr.left + w.scrollLeft;
      const ty = e.clientY - wr.top  + w.scrollTop;
      sdg.innerHTML = `<path d="M ${fx} ${fy} C ${fx} ${fy+50} ${tx} ${ty-50} ${tx} ${ty}"
        fill="none" stroke="#B84D08" stroke-width="2" stroke-dasharray="6,3"/>`;
    }
  }, { signal: sig });

  document.addEventListener('mouseup', async e => {
    if (dragDot) {
      const sdg = document.getElementById('org-chart-svg-drag');
      if (sdg) sdg.innerHTML = '';
      const tgt  = document.elementFromPoint(e.clientX, e.clientY);
      const tNode = tgt?.closest('[id^="org-node-"]');
      if (tNode && tNode.dataset.userId !== dragDot.fromId) {
        const fu = users.find(u=>String(u.id)===String(dragDot.fromId));
        const tu = users.find(u=>String(u.id)===String(tNode.dataset.userId));
        if (confirm(`[${fu?.name}]의 상위 관리자를 [${tu?.name}]으로 설정할까요?`)) {
          try { await API.patch(`/users/${dragDot.fromId}`,{manager_id:tNode.dataset.userId}); showAlert('조직도 업데이트','green'); renderAdmOrg(); }
          catch(e2) { showAlert(e2.message,'red'); }
        }
      }
      dragDot = null;
    }
    if (dragNode) dragNode = null;
  }, { signal: sig });
}

/* ── 차트 헬퍼 함수 ── */
// BFS 레벨 기반 자동 레이아웃
// CEO(level 0) → 직속하위(level 1) → 그 하위(level 2) ...
function _orgAutoLayout(users) {
  const W = 164, H = 72, GX = 40, GY = 130;
  const idSet = new Set(users.map(u => String(u.id)));

  // ── 1단계: BFS로 레벨 계산 ────────────────────────────────
  const levelOf = {};   // userId(string) → level(number)
  const queue   = [];

  // 루트: manager_id 없거나 유효하지 않은 사용자
  users.forEach(u => {
    if (!u.manager_id || !idSet.has(String(u.manager_id))) {
      levelOf[String(u.id)] = 0;
      queue.push(u);
    }
  });

  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const curLv = levelOf[String(cur.id)];
    users
      .filter(x => String(x.manager_id) === String(cur.id))
      .forEach(child => {
        if (levelOf[String(child.id)] === undefined) {
          levelOf[String(child.id)] = curLv + 1;
          queue.push(child);
        }
      });
  }

  // 순환 참조 등으로 미배정된 사용자는 마지막 레벨+1에 배치
  const maxAssigned = Object.values(levelOf).length ? Math.max(...Object.values(levelOf)) : 0;
  users.forEach(u => {
    if (levelOf[String(u.id)] === undefined) levelOf[String(u.id)] = maxAssigned + 1;
  });

  // ── 2단계: 레벨별 사용자 그룹 ────────────────────────────
  const maxLevel = Math.max(...Object.values(levelOf));
  const byLevel  = {};
  for (let l = 0; l <= maxLevel; l++) byLevel[l] = [];
  users.forEach(u => byLevel[levelOf[String(u.id)]].push(u));

  // ── 3단계: 레벨별 중앙 정렬 배치 ────────────────────────
  // 가장 넓은 레벨 기준으로 전체 캔버스 폭 계산
  const maxCount   = Math.max(...Object.values(byLevel).map(a => a.length));
  const canvasW    = Math.max(800, maxCount * W + (maxCount - 1) * GX + 60);
  const pos        = {};

  for (let l = 0; l <= maxLevel; l++) {
    const levelUsers = byLevel[l];
    const rowW = levelUsers.length * W + (levelUsers.length - 1) * GX;
    let x = Math.max(30, (canvasW - rowW) / 2);
    levelUsers.forEach(u => {
      pos[String(u.id)] = { x, y: 40 + l * (H + GY) };
      x += W + GX;
    });
  }

  return pos;
}

function _orgAutoArrange() {
  localStorage.removeItem('orgChartLayout');
  renderAdmOrg();
}

function _orgSaveLayout() {
  const wrap = document.getElementById('org-chart-wrap');
  if (!wrap) return;
  const layout = {};
  wrap.querySelectorAll('[id^="org-node-"]').forEach(n => {
    layout[n.dataset.userId] = { x: n.offsetLeft, y: n.offsetTop };
  });
  localStorage.setItem('orgChartLayout', JSON.stringify(layout));
  showAlert('배치가 저장되었습니다.','green');
}

function _orgFullscreen() {
  const wrap = document.getElementById('org-chart-wrap');
  if (!wrap) return;
  if (!document.fullscreenElement) {
    wrap.requestFullscreen().then(()=>{ wrap.style.height='100vh'; wrap.style.borderRadius='0'; }).catch(()=>{});
  } else {
    document.exitFullscreen().then(()=>{ wrap.style.height='620px'; wrap.style.borderRadius='8px'; }).catch(()=>{});
  }
}

async function changeManager(userId, managerId) {
  try {
    await API.patch(`/users/${userId}`, { manager_id: managerId || null });
    showAlert('조직도가 업데이트되었습니다.','green');
    renderAdmOrg();
  } catch(e) { showAlert(e.message,'red'); }
}

/* ── 권한 관리 ── */
async function renderAdmRoles() {
  const el = document.getElementById('adm-roles'); if(!el)return;
  const users = await API.get('/users');
  el.innerHTML = `<div class="card">
    <div class="card-header"><div><div class="card-header-t">권한 관리</div>
    <div class="card-header-s">사용자별 시스템 접근 권한을 설정합니다</div></div></div>
    <div class="alert alert-purple" style="font-size:12px">
      마스터관리자: 전체 접근 + 데이터 복호화 + 잠금 해제<br>
      일반관리자: 전체 조회 + 데이터 복호화 + 카테고리/정책 설정<br>
      일반사용자: 본인 평가 + 담당 직원 평가만 접근
    </div>
    <table class="tbl">
      <thead><tr><th>이름</th><th>부서/직책</th><th>현재 권한</th><th>변경</th></tr></thead>
      <tbody>${users.map(u=>`<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div class="avatar" style="width:28px;height:28px;font-size:11px;background:var(--o100);color:var(--o800)">${u.name.slice(0,2)}</div>
          ${u.name}
        </div></td>
        <td style="font-size:12px;color:var(--muted)">${u.dept||''} · ${u.title||''}</td>
        <td>${roleBadge(u.role)}</td>
        <td><select style="font-size:12px;height:30px" onchange="changeRole('${u.id}',this.value)">
          <option value="master" ${u.role==='master'?'selected':''}>마스터관리자</option>
          <option value="admin"  ${u.role==='admin' ?'selected':''}>일반관리자</option>
          <option value="user"   ${u.role==='user'  ?'selected':''}>일반사용자</option>
        </select></td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

async function changeRole(userId, role) {
  if (String(userId)===String(App.user.id) && role!=='master') {
    showAlert('자신의 마스터 권한은 유지해야 합니다.','red');
    renderAdmRoles(); return;
  }
  try {
    await API.patch(`/users/${userId}`, { role });
    showAlert('권한이 변경되었습니다.','green');
  } catch(e) { showAlert(e.message,'red'); }
}

/* ── 감사 로그 ── */
const ACTION_LABELS = {
  LOGIN:                { text:'로그인',          cls:'bd-draft'    },
  GOAL_SUBMITTED:       { text:'목표 제출',        cls:'bd-pending'  },
  GOAL_APPROVED:        { text:'목표 승인',        cls:'bd-approved' },
  GOAL_FINAL_APPROVED:  { text:'목표 최종승인',    cls:'bd-approved' },
  GOAL_REJECTED:        { text:'목표 반려',        cls:'bd-rejected' },
  FEEDBACK_SUBMITTED:   { text:'중간 피드백',      cls:'bd-fb'       },
  FINAL_EVAL_LOCKED:    { text:'최종평가 확정',    cls:'bd-final'    },
  FINAL_UNLOCK:         { text:'잠금 해제',        cls:'bd-locked'   },
  ACCOUNT_APPROVED:     { text:'계정 승인',        cls:'bd-approved' },
  ACCOUNT_REJECTED:     { text:'계정 거절',        cls:'bd-rejected' },
  ACCOUNT_ENABLED:      { text:'계정 활성화',      cls:'bd-approved' },
  ACCOUNT_DISABLED:     { text:'계정 비활성화',    cls:'bd-rejected' },
};

let _auditFilter = '';

async function renderAdmAudit() {
  const el = document.getElementById('adm-audit'); if(!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const url = _auditFilter ? `/admin/audit?action=${_auditFilter}` : '/admin/audit';
    const logs = await API.get(url);

    // 액션 종류 목록 (필터용)
    const actionTypes = [...new Set(logs.map(l => l.action))].sort();

    el.innerHTML = `<div class="card">
      <div class="card-header">
        <div>
          <div class="card-header-t">감사 로그</div>
          <div class="card-header-s">승인·반려·피드백·최종평가 등 모든 기록 (최근 300건)</div>
        </div>
        <span class="bd bd-locked">${logs.length}건</span>
      </div>

      <!-- 필터 -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
        <span style="font-size:12px;color:var(--muted)">필터:</span>
        <button class="btn btn-sm ${_auditFilter===''?'btn-primary':'btn-ghost'}"
          onclick="_auditFilter='';renderAdmAudit()">전체</button>
        ${['GOAL_SUBMITTED','GOAL_APPROVED','GOAL_FINAL_APPROVED','GOAL_REJECTED',
           'FEEDBACK_SUBMITTED','FINAL_EVAL_LOCKED','LOGIN'].map(a => {
          const lbl = ACTION_LABELS[a] || { text: a, cls: 'bd-draft' };
          return `<button class="btn btn-sm ${_auditFilter===a?'btn-primary':'btn-ghost'}"
            onclick="_auditFilter='${a}';renderAdmAudit()">${lbl.text}</button>`;
        }).join('')}
      </div>

      <!-- 로그 테이블 -->
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead>
            <tr>
              <th style="white-space:nowrap">일시</th>
              <th>수행자</th>
              <th>액션</th>
              <th>대상자</th>
              <th>상세 내용</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            ${logs.length === 0
              ? '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">기록이 없습니다.</td></tr>'
              : logs.map(l => {
                const lbl = ACTION_LABELS[l.action] || { text: l.action, cls: 'bd-draft' };
                const isImportant = ['GOAL_REJECTED','FINAL_EVAL_LOCKED','ACCOUNT_DISABLED','FINAL_UNLOCK'].includes(l.action);
                return `<tr style="${isImportant ? 'background:var(--o50)' : ''}">
                  <td style="font-size:11px;color:var(--muted);white-space:nowrap">
                    ${(l.created_at||'').slice(0,16).replace('T',' ')}
                  </td>
                  <td style="font-size:13px;font-weight:500;white-space:nowrap">
                    ${l.actor_name||'(시스템)'}
                    ${l.actor_dept ? `<div style="font-size:11px;color:var(--muted);font-weight:400">${l.actor_dept}</div>` : ''}
                  </td>
                  <td><span class="bd ${lbl.cls}" style="white-space:nowrap">${lbl.text}</span></td>
                  <td style="font-size:12px;color:var(--muted);white-space:nowrap">${l.target_name||'-'}</td>
                  <td style="font-size:12px;color:var(--color-text-primary);max-width:280px">${l.detail||'-'}</td>
                  <td style="font-size:11px;color:var(--muted)">${l.ip||'-'}</td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}


/* ── 전직원 평가 현황 대시보드 ── */
async function renderAdmStatus() {
  const el = document.getElementById('adm-status');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const data = await API.get('/admin/eval-status');
    if (!Array.isArray(data)) throw new Error('데이터 형식 오류');

    const phaseLabel = {
      none:              { text:'미시작',       cls:'bd-draft'    },
      draft:             { text:'작성중',        cls:'bd-draft'    },
      pending:           { text:'승인 대기',     cls:'bd-pending'  },
      approved:          { text:'목표 확정',     cls:'bd-approved' },
      rejected:          { text:'반려됨',        cls:'bd-rejected' },
      final_self:        { text:'자기평가 중',   cls:'bd-fb'       },
      final_mgr_pending: { text:'상사평가 대기', cls:'bd-final'    },
      final_done:        { text:'평가 완료',     cls:'bd-locked'   },
    };

    const total    = data.length;
    const started  = data.filter(u => u.phase !== 'none').length;
    const approved = data.filter(u => ['approved','final_self','final_mgr_pending','final_done'].includes(u.phase)).length;
    const done     = data.filter(u => u.phase === 'final_done').length;

    const byDept = {};
    data.forEach(u => {
      const d = u.dept || '미배정';
      if (!byDept[d]) byDept[d] = [];
      byDept[d].push(u);
    });

    // 요약 카드
    const summaryCards = [
      { label:'전체 직원', val:total,    color:'var(--o400)'   },
      { label:'목표 시작', val:started,  color:'var(--o500)'   },
      { label:'목표 확정', val:approved, color:'var(--green)'  },
      { label:'평가 완료', val:done,     color:'var(--purple)' },
    ];

    const wrap = document.createElement('div');

    // 요약
    const summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:14px';
    summaryCards.forEach(s => {
      summaryDiv.innerHTML += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center"><div style="font-size:26px;font-weight:700;color:' + s.color + '">' + s.val + '</div><div style="font-size:12px;color:var(--muted);margin-top:3px">' + s.label + '</div></div>';
    });
    wrap.appendChild(summaryDiv);

    // 부서별 테이블
    Object.entries(byDept).forEach(function([dept, members], idx) {
      const tableId = 'dept-tbl-' + idx;
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '10px';

      // 헤더
      const hd = document.createElement('div');
      hd.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';
      hd.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:14px;font-weight:600">' + dept + '</span><span style="font-size:12px;color:var(--muted)">' + members.length + '명</span></div>';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn btn-ghost btn-sm';
      toggleBtn.style.fontSize = '12px';
      toggleBtn.textContent = '접기 ▲';
      toggleBtn.dataset.tableId = tableId;
      toggleBtn.onclick = function() { toggleDeptTable(tableId, this); };
      hd.appendChild(toggleBtn);
      card.appendChild(hd);

      // 테이블 래퍼
      const tableWrap = document.createElement('div');
      tableWrap.id = tableId;

      const tbl = document.createElement('table');
      tbl.className = 'tbl';
      tbl.innerHTML = '<thead><tr><th>이름</th><th>직책</th><th>평가 단계</th><th>기간</th><th style="text-align:center">목표</th><th style="text-align:center">피드백</th><th style="text-align:center">최종 점수</th><th></th></tr></thead><tbody></tbody>';
      const tbody = tbl.querySelector('tbody');

      members.forEach(function(u) {
        const ph = phaseLabel[u.phase] || { text: u.phase, cls: 'bd-draft' };
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.dataset.userId = u.id;
        tr.dataset.userName = u.name;
        tr.onclick = function() { renderEvalDetail(u.id, u.name); };

        const scoreHtml = u.final_score != null
          ? '<span style="font-weight:600;color:var(--o500)">' + u.final_score + '점</span> <span class="grade grade-' + u.final_grade + '">' + u.final_grade + '</span>'
          : '<span style="color:var(--muted);font-size:12px">-</span>';

        tr.innerHTML = '<td style="font-weight:500">' + u.name + '</td>'
          + '<td style="font-size:12px;color:var(--muted)">' + (u.title||'-') + '</td>'
          + '<td><span class="bd ' + ph.cls + '">' + ph.text + '</span></td>'
          + '<td style="font-size:12px;color:var(--muted)">' + (u.period_label||'-') + '</td>'
          + '<td style="text-align:center;font-size:13px">' + (u.goal_count||'-') + '</td>'
          + '<td style="text-align:center;font-size:13px">' + (u.feedback_count||'-') + '</td>'
          + '<td style="text-align:center">' + scoreHtml + '</td>'
          + '<td><button class="btn btn-ghost btn-sm" style="font-size:11px">상세</button></td>';

        // 상세 버튼 이벤트 (따옴표 문제 없이 DOM으로 처리)
        tr.querySelector('button').onclick = function(e) {
          e.stopPropagation();
          renderEvalDetail(u.id, u.name);
        };
        tbody.appendChild(tr);
      });

      tableWrap.appendChild(tbl);
      card.appendChild(tableWrap);
      wrap.appendChild(card);
    });

    el.innerHTML = '';
    el.appendChild(wrap);
  } catch(e) {
    el.innerHTML = '<div class="alert alert-red">오류: ' + e.message + '</div>';
  }
}


function toggleDeptTable(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? '' : 'none';
  btn.textContent  = isHidden ? '접기 ▲' : '펼치기 ▼';
}

/* ── 직원 개인 평가 상세 조회 (관리자용) ── */
async function renderEvalDetail(userId, userName) {
  const el = document.getElementById('adm-status');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const d = await API.get('/admin/eval-detail/' + userId);

    const backBtn = '<button class="btn btn-ghost btn-sm" onclick="renderAdmStatus()">← 전직원 현황</button>';

    if (!d.eval) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          ${backBtn}
          <span style="font-size:15px;font-weight:600">${userName}</span>
        </div>
        <div class="card"><div class="alert alert-orange">아직 평가를 시작하지 않았습니다.</div></div>`;
      return;
    }

    const phaseLabels = {
      draft:'목표 작성 중', pending:'승인 대기', approved:'목표 확정',
      final_self:'자기평가 중', final_mgr_pending:'상사평가 대기', final_done:'평가 완료'
    };
    const scoreTxt = ['미달성','미흡','보통','우수','탁월'];

    const cats = App.categories;
    const goalsByCat = {};
    d.goals.forEach(g => {
      if (!goalsByCat[g.category_id]) goalsByCat[g.category_id] = [];
      goalsByCat[g.category_id].push(g);
    });

    // 최종 평가 결과 섹션
    let scoreHtml = '';
    if (d.finalEval && d.finalEval.mgr_done) {
      const scoresMap = {};
      (d.finalEval.scores || []).forEach(s => { scoresMap[s.goal_id] = s; });
      scoreHtml = `
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <div style="font-size:14px;font-weight:600">최종 평가 결과</div>
            <div>
              <span style="font-size:28px;font-weight:700;color:var(--o500)">${d.finalEval.final_score}점</span>
              <span class="grade grade-${d.finalEval.final_grade}" style="margin-left:8px">${d.finalEval.final_grade}</span>
            </div>
          </div>
          ${d.goals.map(g => {
            const sc  = scoresMap[g.id];
            const ms  = sc ? Math.round(sc.mgr_score / 5 * 100) : 0;
            return `<div style="margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;flex-wrap:wrap;gap:4px">
                <span style="font-weight:500">${g.name}</span>
                <div style="display:flex;gap:10px;font-size:12px">
                  ${sc && sc.self_score ? `<span style="color:var(--muted)">자기: ${scoreTxt[sc.self_score-1]}</span>` : ''}
                  <span style="color:var(--o800);font-weight:500">상사: ${sc ? scoreTxt[sc.mgr_score-1] : '-'} (${ms}%)</span>
                </div>
              </div>
              <div style="background:var(--bg);border-radius:5px;height:14px;overflow:hidden;border:1px solid var(--border)">
                <div style="height:100%;background:var(--o400);border-radius:5px;width:${ms}%"></div>
              </div>
            </div>`;
          }).join('')}
          ${d.finalEval.mgr_note  ? `<div class="alert alert-purple" style="margin-top:10px;font-size:13px">상사 종합 의견: ${d.finalEval.mgr_note}</div>`  : ''}
          ${d.finalEval.self_note ? `<div class="alert alert-orange" style="margin-top:6px;font-size:13px">자기 의견: ${d.finalEval.self_note}</div>` : ''}
        </div>`;
    }

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        ${backBtn}
        <div>
          <span style="font-size:15px;font-weight:600">${d.user.name}</span>
          <span style="font-size:13px;color:var(--muted);margin-left:8px">${d.user.dept || ''} · ${d.user.title || ''}</span>
          <span class="bd ${d.eval.phase === 'final_done' ? 'bd-locked' : 'bd-approved'}" style="margin-left:8px">
            ${phaseLabels[d.eval.phase] || d.eval.phase}
          </span>
        </div>
        <span style="font-size:12px;color:var(--muted);margin-left:auto">${d.eval.period_label || ''}</span>
      </div>

      <div class="card">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px">목표 항목 (${d.goals.length}개)</div>
        ${cats.map(cat => {
          const cg = goalsByCat[cat.id] || [];
          if (!cg.length) return '';
          return `<div style="margin-bottom:12px">
            <span style="font-size:12px;font-weight:500;padding:2px 8px;border-radius:10px;background:${cat.color};color:${cat.text_color};display:inline-block;margin-bottom:6px">${cat.name} ${cat.weight}%</span>
            ${cg.map((g, i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--o50)">
                <span style="font-size:11px;color:var(--muted);min-width:16px">${i+1}</span>
                <span style="flex:1;font-size:13px;font-weight:500">${g.name}</span>
                <span style="font-size:12px;color:var(--muted)">${g.kpi || '-'}</span>
                <span style="font-size:11px;background:var(--o100);color:var(--o800);padding:1px 7px;border-radius:10px;font-weight:500">${g.weight}%</span>
              </div>`).join('')}
          </div>`;
        }).join('')}
      </div>

      ${d.approvals.length ? `
      <div class="card">
        <div style="font-size:14px;font-weight:600;margin-bottom:10px">승인 이력</div>
        ${d.approvals.map(a => `
          <div class="user-row">
            <div class="avatar" style="background:var(--o100);color:var(--o800)">${a.approver_name.slice(0,2)}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500">${a.approver_name} (${a.approver_title || ''})</div>
              <div style="font-size:12px;color:var(--muted)">${a.level}차 · ${(a.created_at || '').slice(0,10)}</div>
              ${a.note ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${a.note}</div>` : ''}
            </div>
            <span class="bd ${a.action === 'approved' ? 'bd-approved' : 'bd-rejected'}">${a.action === 'approved' ? '승인' : '반려'}</span>
          </div>`).join('')}
      </div>` : ''}

      ${scoreHtml}

      ${d.feedbacks.length ? `
      <div class="card">
        <div style="font-size:14px;font-weight:600;margin-bottom:10px">중간 피드백 (${d.feedbacks.length}건)</div>
        ${d.feedbacks.map((fb, i) => `
          <div class="fb-entry">
            <div class="fb-meta">
              <span class="bd bd-fb">${fb.author_name} 피드백 #${d.feedbacks.length - i}</span>
              <span>${(fb.created_at || '').slice(0,10)}</span>
            </div>
            ${(fb.items || []).filter(it => it.note || it.score).map(it => `
              <div style="padding:4px 0;border-bottom:1px solid var(--o50)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
                  <span style="font-size:12px;font-weight:500">${it.goal_name || ''}</span>
                  ${it.score ? `<span style="font-size:11px;background:var(--o100);color:var(--o800);padding:1px 7px;border-radius:10px;font-weight:500">${scoreTxt[it.score-1]}</span>` : ''}
                </div>
                ${it.note ? `<div style="font-size:12px;color:var(--muted)">${it.note}</div>` : ''}
              </div>`).join('')}
            ${fb.overall_note ? `<div style="font-size:13px;margin-top:6px;padding:6px 8px;background:var(--white);border-radius:6px">${fb.overall_note}</div>` : ''}
          </div>`).join('')}
      </div>` : ''}`;

  } catch(e) {
    el.innerHTML = `
      <div class="alert alert-red">오류: ${e.message}</div>
      <button class="btn btn-ghost btn-sm" onclick="renderAdmStatus()">← 뒤로</button>`;
  }
}


/* ── 평가 정책 설정 ── */
async function renderAdmPolicy() {
  const el = document.getElementById('adm-policy');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const [histVis, histInactive, fbLimit, apprEdit, secondFinal] = await Promise.all([
      API.get('/settings/history-visibility'),
      API.get('/settings/history-inactive'),
      API.get('/settings/feedback-limit'),
      API.get('/settings/approval-edit'),
      API.get('/settings/second-final'),
    ]);

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
          <div style="font-size:12px;color:var(--muted)">승인자별 피드백 제출 가능 횟수</div>
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
          <div style="font-size:12px;color:var(--muted)">1차 직속 상사 의무 · 2차 이상 선택</div>
        </div>
        <span class="bd bd-approved">의무/선택 분리 적용 중</span>
      </div>

      <div class="srow">
        <div>
          <div style="font-size:14px;font-weight:500">승인자 승인 수정/취소 허용</div>
          <div style="font-size:12px;color:var(--muted)">켜짐: 승인자가 본인의 승인을 수정·취소 가능</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="bd ${apprEdit.enabled?'bd-approved':'bd-rejected'}">${apprEdit.enabled?'켜짐':'꺼짐'}</span>
          <button class="btn btn-ghost btn-sm" onclick="toggleApprEdit()">${apprEdit.enabled?'끄기':'켜기'}</button>
        </div>
      </div>

      <div class="srow">
        <div>
          <div style="font-size:14px;font-weight:500">2차 최종평가 허용</div>
          <div style="font-size:12px;color:var(--muted)">켜짐: 1차 평가자 위 상위 승인자도 최종평가 가능 · 꺼짐: 1차(직속 상사)만 평가</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="bd ${secondFinal.enabled?'bd-approved':'bd-rejected'}">${secondFinal.enabled?'켜짐':'꺼짐'}</span>
          <button class="btn btn-ghost btn-sm" onclick="toggleSecondFinal()">${secondFinal.enabled?'끄기':'켜기'}</button>
        </div>
      </div>

      <div class="srow">
        <div>
          <div style="font-size:14px;font-weight:500">직원 목표승인 이력 공개</div>
          <div style="font-size:12px;color:var(--muted)">직원이 본인의 과거 승인/반려 이력 열람 허용</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="bd ${histVis.enabled?'bd-approved':'bd-rejected'}">${histVis.enabled?'켜짐':'꺼짐'}</span>
          <button class="btn btn-ghost btn-sm" onclick="toggleHistoryVisibility()">${histVis.enabled?'끄기':'켜기'}</button>
        </div>
      </div>

      <div class="srow" style="${!histVis.enabled?'opacity:.4;pointer-events:none':''}">
        <div style="padding-left:16px">
          <div style="font-size:13px;font-weight:500">↳ 비활성 기간 이력도 공개</div>
          <div style="font-size:12px;color:var(--muted)">켜짐: 활성/비활성 기간 모두 · 꺼짐: 활성 기간만</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="bd ${histInactive.enabled?'bd-approved':'bd-rejected'}">${histInactive.enabled?'켜짐 (전체)':'꺼짐 (활성만)'}</span>
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
    showAlert(`피드백 횟수 제한이 "${sel.options[sel.selectedIndex].text}"로 설정되었습니다.`, 'green');
  } catch(e) { showAlert(e.message, 'red'); }
}

async function toggleApprEdit() {
  try {
    const cur = await API.get('/settings/approval-edit');
    await API.post('/settings/approval-edit', { enabled: !cur.enabled });
    showAlert(!cur.enabled ? '승인 수정/취소가 허용되었습니다.' : '승인 수정/취소가 비활성화되었습니다.',
              !cur.enabled ? 'green' : 'red');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function toggleSecondFinal() {
  try {
    const cur = await API.get('/settings/second-final');
    await API.post('/settings/second-final', { enabled: !cur.enabled });
    showAlert(!cur.enabled ? '2차 최종평가가 허용되었습니다.' : '2차 최종평가가 비활성화되었습니다.',
              !cur.enabled ? 'green' : 'red');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function toggleHistoryVisibility() {
  try {
    const cur = await API.get('/settings/history-visibility');
    await API.post('/settings/history-visibility', { enabled: !cur.enabled });
    showAlert(!cur.enabled ? '이력 공개가 켜졌습니다.' : '이력 공개가 꺼졌습니다.',
              !cur.enabled ? 'green' : 'red');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function toggleHistoryInactive() {
  try {
    const cur = await API.get('/settings/history-inactive');
    await API.post('/settings/history-inactive', { enabled: !cur.enabled });
    showAlert(!cur.enabled ? '비활성 기간 이력도 공개됩니다.' : '활성 기간 이력만 공개됩니다.',
              !cur.enabled ? 'green' : 'red');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}


/* ── 평가 등급 기준 관리 ── */
async function renderAdmGrades() {
  const el = document.getElementById('adm-grades');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const grades = await API.get('/grade-criteria');
    el.innerHTML = `<div class="card">
      <div class="card-header"><div>
        <div class="card-header-t">평가 등급 기준 관리</div>
        <div class="card-header-s">최소 2개 이상 · 순위 숫자가 작을수록 높은 등급 · 최종평가 시 평가자가 이 기준에서 선택합니다</div>
      </div></div>

      <table class="tbl" style="margin-bottom:16px">
        <thead><tr>
          <th style="width:55px;text-align:center">순위</th>
          <th style="width:100px">등급 코드</th>
          <th style="width:200px">등급 명칭</th>
          <th>설명</th>
          <th style="width:90px">비고</th>
          <th style="width:90px"></th>
        </tr></thead>
        <tbody>
          ${grades.map((g, idx) => `<tr>
            <td style="text-align:center">
              <input id="gc-sort-${g.id}" type="number" min="1" value="${g.sort_order||idx+1}"
                style="width:48px;text-align:center;font-size:12px;height:28px">
            </td>
            <td><input id="gc-code-${g.id}" value="${g.grade_code||''}" style="width:100%;font-size:12px;height:28px"></td>
            <td><input id="gc-name-${g.id}" value="${g.grade_name||''}" style="width:100%;font-size:12px;height:28px"></td>
            <td><textarea id="gc-desc-${g.id}" style="width:100%;font-size:12px;min-height:60px;resize:vertical;padding:4px 6px" placeholder="등급 설명">${g.description||''}</textarea></td>
            <td><input id="gc-note-${g.id}" value="${(g.note||'').replace(/"/g,'&quot;')}" style="width:100%;font-size:12px;height:28px" placeholder="비고"></td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="saveGrade(${g.id})">저장</button>
                <button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;padding:3px 6px;font-size:11px" onclick="deleteGrade(${g.id})">삭제</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>

      <!-- 새 등급 추가 -->
      <div style="background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:14px">
        <div style="font-size:13px;font-weight:500;margin-bottom:10px;color:var(--o800)">새 등급 추가</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:0 0 55px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">순위</label>
            <input id="new-gc-sort" type="number" min="1" value="${grades.length+1}" style="width:100%;height:34px;font-size:13px;text-align:center">
          </div>
          <div style="flex:0 0 95px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">등급 코드</label>
            <input id="new-gc-code" placeholder="예: OI" style="width:100%;height:34px;font-size:13px">
          </div>
          <div style="flex:1;min-width:130px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">등급 명칭</label>
            <input id="new-gc-name" placeholder="등급 명칭" style="width:100%;height:34px;font-size:13px">
          </div>
          <div style="flex:2;min-width:160px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">설명</label>
            <textarea id="new-gc-desc" placeholder="등급 설명" style="width:100%;height:60px;resize:vertical;font-size:13px;padding:4px 6px"></textarea>
          </div>
          <div style="flex:1;min-width:75px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">비고</label>
            <input id="new-gc-note" placeholder="비고" style="width:100%;height:34px;font-size:13px">
          </div>
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
      sort_order:  parseInt(document.getElementById('gc-sort-'+id)?.value||'0'),
    });
    showAlert('저장되었습니다.', 'green');
    renderAdmGrades();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function deleteGrade(id) {
  if (!confirm('이 등급을 삭제하시겠습니까?')) return;
  try {
    await API.del('/grade-criteria/' + id);
    showAlert('삭제되었습니다.', 'green');
    renderAdmGrades();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function addGrade() {
  try {
    const sortVal = parseInt(document.getElementById('new-gc-sort')?.value || '999');
    await API.post('/grade-criteria', {
      grade_code:  document.getElementById('new-gc-code')?.value.trim(),
      grade_name:  document.getElementById('new-gc-name')?.value.trim(),
      description: document.getElementById('new-gc-desc')?.value.trim(),
      note:        document.getElementById('new-gc-note')?.value.trim(),
      sort_order:  sortVal,
    });
    showAlert('새 등급이 추가되었습니다.', 'green');
    renderAdmGrades();
  } catch(e) { showAlert(e.message, 'red'); }
}


/* ── 평가 기간 관리 ── */
async function renderAdmPeriods() {
  const el = document.getElementById('adm-periods');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const periods = await API.get('/eval-periods');
    el.innerHTML = `<div class="card">
      <div class="card-header"><div>
        <div class="card-header-t">평가 기간 관리</div>
        <div class="card-header-s">활성화된 기간만 직원들이 목표를 작성할 수 있습니다</div>
      </div></div>

      <!-- 새 기간 추가 -->
      <div style="background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:14px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:500;margin-bottom:10px;color:var(--o800)">새 평가 기간 추가</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:1;min-width:100px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">연도</label>
            <select id="np-year" style="height:34px;font-size:13px;width:100%">
              <option>2024년</option><option selected>2025년</option><option>2026년</option><option>2027년</option>
            </select>
          </div>
          <div style="flex:1;min-width:100px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">구분</label>
            <select id="np-type" onchange="updatePeriodLabel()" style="height:34px;font-size:13px;width:100%">
              <option value="q">분기</option>
              <option value="h">반기</option>
            </select>
          </div>
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">기간</label>
            <select id="np-sub" onchange="updatePeriodLabel()" style="height:34px;font-size:13px;width:100%">
              <option value="1">1분기 (1~3월)</option>
              <option value="2">2분기 (4~6월)</option>
              <option value="3">3분기 (7~9월)</option>
              <option value="4">4분기 (10~12월)</option>
            </select>
          </div>
          <div style="flex:1;min-width:100px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">활성화</label>
            <select id="np-active" style="height:34px;font-size:13px;width:100%">
              <option value="1">즉시 활성화</option>
              <option value="0">비활성으로 추가</option>
            </select>
          </div>
          <button class="btn btn-primary" style="height:34px;white-space:nowrap" onclick="addEvalPeriod()">+ 추가</button>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--muted)">
          생성될 기간: <strong id="np-preview"></strong>
        </div>
      </div>

      <!-- 기간 목록 -->
      <table class="tbl">
        <thead><tr>
          <th>평가 기간</th><th>구분</th><th>연도</th>
          <th style="text-align:center">상태</th><th></th>
        </tr></thead>
        <tbody>
          ${!periods.length
            ? '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">등록된 평가 기간이 없습니다.</td></tr>'
            : periods.map(p => `<tr>
                <td style="font-weight:500">${p.period_label}</td>
                <td><span class="bd ${p.period_type==='q'?'bd-q':'bd-h'}">${p.period_type==='q'?'분기':'반기'}</span></td>
                <td style="font-size:12px;color:var(--muted)">${p.eval_year}</td>
                <td style="text-align:center">
                  <span class="bd ${p.is_active?'bd-approved':'bd-rejected'}">${p.is_active?'활성':'비활성'}</span>
                </td>
                <td>
                  <div style="display:flex;gap:4px;justify-content:flex-end">
                    <button class="btn btn-ghost btn-sm" onclick="togglePeriod(${p.id})">
                      ${p.is_active?'비활성화':'활성화'}
                    </button>
                    ${App.isMaster() ? `<button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;padding:4px 8px;font-size:11px" onclick="deletePeriod(${p.id})">삭제</button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
    updatePeriodLabel();
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

function updatePeriodLabel() {
  const year  = document.getElementById('np-year')?.value  || '2025년';
  const type  = document.getElementById('np-type')?.value  || 'q';
  const subEl = document.getElementById('np-sub');
  const prev  = document.getElementById('np-preview');
  if (subEl) {
    const curVal = subEl.value;
    if (type === 'q') {
      subEl.innerHTML = '<option value="1">1분기 (1~3월)</option><option value="2">2분기 (4~6월)</option><option value="3">3분기 (7~9월)</option><option value="4">4분기 (10~12월)</option>';
    } else {
      subEl.innerHTML = '<option value="1">상반기 (1~6월)</option><option value="2">하반기 (7~12월)</option>';
    }
    if ([...subEl.options].some(o => o.value === curVal)) subEl.value = curVal;
  }
  const sub   = subEl?.value || '1';
  const label = type === 'q'
    ? `${year} ${sub}분기`
    : `${year} ${sub==='1'?'상':'하'}반기`;
  if (prev) prev.textContent = label;
}

async function addEvalPeriod() {
  const year   = document.getElementById('np-year')?.value   || '2025년';
  const type   = document.getElementById('np-type')?.value   || 'q';
  const sub    = document.getElementById('np-sub')?.value    || '1';
  const active = document.getElementById('np-active')?.value || '1';
  const label  = type === 'q'
    ? `${year} ${sub}분기`
    : `${year} ${sub==='1'?'상':'하'}반기`;
  try {
    await API.post('/eval-periods', { period_type:type, period_label:label, eval_year:year, is_active:parseInt(active) });
    showAlert(`${label} 기간이 추가되었습니다.`, 'green');
    renderAdmPeriods();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function togglePeriod(id) {
  try {
    const res = await API.patch('/eval-periods/' + id + '/toggle', {});
    showAlert(res.is_active ? '기간이 활성화되었습니다.' : '기간이 비활성화되었습니다.', res.is_active ? 'green' : 'red');
    renderAdmPeriods();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function deletePeriod(id) {
  if (!confirm('이 평가 기간을 삭제하시겠습니까?')) return;
  try {
    await API.del('/eval-periods/' + id);
    showAlert('삭제되었습니다.', 'green');
    renderAdmPeriods();
  } catch(e) { showAlert(e.message, 'red'); }
}
