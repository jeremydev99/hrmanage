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
    <div class="adm-tabs-wrap">
      <!-- 1줄: 평가 관리 -->
      <div class="adm-tabs">
        <button class="adm-tab active" data-tab="adm-accounts" id="stb-adm-accounts" onclick="switchAdmTab('adm-accounts')">계정 승인 관리${pendingCount > 0 ? ` <span class="cnt">${pendingCount}</span>` : ''}</button>
        <button class="adm-tab" data-tab="adm-status"   id="stb-adm-status"   onclick="switchAdmTab('adm-status')">전직원 평가 현황</button>
        <button class="adm-tab" data-tab="adm-cat"      id="stb-adm-cat"      onclick="switchAdmTab('adm-cat')">목표 카테고리</button>
        <button class="adm-tab" data-tab="adm-periods"  id="stb-adm-periods"  onclick="switchAdmTab('adm-periods')">평가 기간 관리</button>
        <button class="adm-tab" data-tab="adm-grade-policies" id="stb-adm-grade-policies" onclick="switchAdmTab('adm-grade-policies')">등급 정책 관리</button>
        <button class="adm-tab" data-tab="adm-policy"   id="stb-adm-policy"   onclick="switchAdmTab('adm-policy')">평가 정책</button>
      </div>
      <!-- 2줄: 조직/권한/로그 -->
      <div class="adm-tabs">
        <button class="adm-tab" data-tab="adm-org"      id="stb-adm-org"      onclick="switchAdmTab('adm-org')">조직도 관리</button>
        <button class="adm-tab" data-tab="adm-orgtable" id="stb-adm-orgtable" onclick="switchAdmTab('adm-orgtable')">조직 관리</button>
        <button class="adm-tab" data-tab="adm-roles"    id="stb-adm-roles"    onclick="switchAdmTab('adm-roles')">권한 관리</button>
        <button class="adm-tab" data-tab="adm-audit"    id="stb-adm-audit"    onclick="switchAdmTab('adm-audit')">감사 로그</button>
      </div>
    </div>
    <div class="sp active" id="adm-accounts"></div>
    <div class="sp"        id="adm-status"></div>
    <div class="sp"        id="adm-cat"></div>
    <div class="sp"        id="adm-periods"></div>
    <div class="sp"        id="adm-org"></div>
    <div class="sp"        id="adm-orgtable"></div>
    <div class="sp"        id="adm-roles"></div>
    <div class="sp"        id="adm-policy"></div>
    <div class="sp"        id="adm-grade-policies"></div>
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

// ── 변경사항 추적 ─────────────────────────────────────────
let _adminDirty = false;

// ── 평가 정책 임시 상태 ──────────────────────────────────
let _policyState = {};
let _policyDirty = false;
let _sessionPolicyCache = { close_on_browser_close: false, timeout_minutes: 480 };

function setSessionPref(key, val, btn) {
  _sessionPolicyCache[key] = val;
  _policyState['session_policy'] = Object.assign({}, _sessionPolicyCache);
  _policyDirty = true;
  if (btn) {
    const group = btn.closest('[data-policy-group]');
    if (group) {
      group.querySelectorAll('button').forEach(function(b) { b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); });
      btn.classList.remove('btn-ghost'); btn.classList.add('btn-primary');
    }
  }
  document.querySelectorAll('.policy-save-btn').forEach(function(b) {
    b.classList.remove('btn-ghost'); b.classList.add('btn-primary');
    b.innerHTML = '💾 저장하기 <span style="font-size:11px">(변경사항 있음)</span>';
  });
}

function setPolicyState(key, value, btn) {
  _policyState[key] = value;
  _policyDirty = true;
  if (btn) {
    const group = btn.closest('[data-policy-group]');
    if (group) {
      group.querySelectorAll('button').forEach(b => {
        b.classList.remove('btn-primary'); b.classList.add('btn-ghost');
      });
      btn.classList.remove('btn-ghost'); btn.classList.add('btn-primary');
    }
  }
  document.querySelectorAll('.policy-save-btn').forEach(b => {
    b.classList.remove('btn-ghost'); b.classList.add('btn-primary');
    b.innerHTML = '💾 저장하기 <span style="font-size:11px">(변경사항 있음)</span>';
  });
}

function markDirty() {
  _adminDirty = true;
  document.querySelectorAll('.adm-save-btn').forEach(btn => {
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-primary');
    btn.textContent = '💾 저장하기 (변경사항 있음)';
  });
}

function clearDirty() {
  _adminDirty = false;
  document.querySelectorAll('.adm-save-btn').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-ghost');
    btn.textContent = '저장하기';
  });
}

function switchAdmTab(id) {
  if (_policyDirty) {
    if (!confirm('저장하지 않은 정책 변경사항이 있습니다.\n탭을 이동하면 변경사항이 사라집니다. 계속하시겠습니까?')) return;
    _policyState = {}; _policyDirty = false;
  }
  if (_adminDirty) {
    if (!confirm('저장하지 않은 변경사항이 있습니다. 계속하시겠습니까?')) return;
    clearDirty();
  }
  document.querySelectorAll('.adm-tab,.stb').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === id || t.id === 'stb-'+id);
  });
  document.querySelectorAll('.sp').forEach(s=>s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  if (id==='adm-accounts') renderAdmAccounts();
  if (id==='adm-status')   renderAdmStatus();
  if (id==='adm-cat')      renderAdmCat();
  if (id==='adm-periods')  renderAdmPeriods();
  if (id==='adm-org')      renderAdmOrg();
  if (id==='adm-orgtable') renderAdmOrgTable();
  if (id==='adm-roles')    renderAdmRoles();
  if (id==='adm-policy')   renderAdmPolicy();
  if (id==='adm-grade-policies') renderGradePolicies();
  if (id==='adm-audit')    renderAdmAudit();
}

/* ── 카테고리 관리 ── */
let _editCats = [];
let _deletedCatIds = [];   // 삭제 대상 카테고리 ID 추적
async function renderAdmCat() {
  const el = document.getElementById('adm-cat'); if(!el)return;
  _editCats = JSON.parse(JSON.stringify(App.categories));
  _deletedCatIds = [];
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
  markDirty();
  _editCats[i][field] = field==='weight' ? Math.max(0,Math.min(100,parseInt(val)||0)) : val;
  const totalW = _editCats.reduce((a,c)=>a+Number(c.weight),0);
  const alertEl = document.querySelector('#adm-cat .alert');
  if (alertEl) {
    alertEl.className = `alert ${totalW===100?'alert-green':'alert-orange'}`;
    alertEl.innerHTML = `카테고리 가중치 합계: <strong>${totalW}%</strong> ${totalW===100?'✓ 정상':'— 합계가 100%여야 합니다'}`;
  }
}
function addEditCat() { _editCats.push({name:'새 카테고리',description:'',weight:0,color:'#F1EFE8',text_color:'#444441'}); rebuildCatUI(); }
function delEditCat(i) {
  if (_editCats.length <= 1) { showAlert('최소 1개 이상 필요합니다.','orange'); return; }
  const removed = _editCats[i];
  if (removed && removed.id) { _deletedCatIds.push(removed.id); }
  _editCats.splice(i, 1);
  markDirty();
  rebuildCatUI();
}

async function saveCats() {
  const totalW = _editCats.reduce((a,c)=>a+Number(c.weight),0);
  if (totalW !== 100) { showAlert('가중치 합계가 100%여야 합니다. 현재: '+totalW+'%','orange'); return; }
  try {
    // 1. 추가/수정 처리
    for (const cat of _editCats) {
      if (cat.id) await API.put(`/categories/${cat.id}`, cat);
      else await API.post('/categories', cat);
    }
    // 2. 삭제 처리
    for (const id of _deletedCatIds) {
      await API.del(`/categories/${id}`);
    }
    _deletedCatIds = [];
    // 3. 목록 갱신
    App.categories = await API.get('/categories');
    clearDirty();
    showAlert('카테고리가 저장되었습니다!','green');
    renderAdmCat();
  } catch(e) { showAlert(e.message,'red'); }
}

/* ── 조직도 관리 ── */
/* ── 조직 관리 (organizations 테이블 기반) ── */
async function renderAdmOrgTable() {
  const el = document.getElementById('adm-orgtable');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const [orgs, users] = await Promise.all([
      API.get('/organizations'),
      API.get('/users'),
    ]);
    const rootOrgs = orgs.filter(o => !o.parent_id);

    function renderOrgTree(org, depth = 0) {
      const children = orgs.filter(o => o.parent_id === org.id);
      const members  = users.filter(u => String(u.org_id) === String(org.id) && u.is_active);
      const indent   = depth * 20;
      return `
        <div style="margin-left:${indent}px;margin-bottom:8px;
                    border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div>
              <span style="font-size:14px;font-weight:600;color:var(--o800)">${org.name}</span>
              ${org.leader_name
                ? `<span style="font-size:12px;color:var(--muted);margin-left:8px">리더: ${org.leader_name} ${org.leader_title||''}</span>`
                : `<span style="font-size:12px;color:#E53935;margin-left:8px">리더 미지정</span>`}
              <span style="font-size:11px;color:var(--muted);margin-left:8px">멤버 ${members.length}명</span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm"
                onclick="editOrg(${org.id},'${org.name.replace(/'/g,"\\'")}',${org.leader_id||'null'},${org.parent_id||'null'})">편집</button>
              <button class="btn btn-sm" style="font-size:11px;border:1px solid #F09595;color:#A32D2D"
                onclick="deleteOrg(${org.id},'${org.name.replace(/'/g,"\\'")}')">삭제</button>
            </div>
          </div>
          ${members.length ? `
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">
            ${members.map(m => `
              <span style="font-size:11px;background:var(--o50);padding:2px 8px;border-radius:12px;color:var(--o700)">
                ${m.name} ${m.title||''}
                <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px"
                  onclick="removeFromOrg(${m.id},'${m.name}')">✕</button>
              </span>`).join('')}
          </div>` : ''}
          ${children.map(child => renderOrgTree(child, depth + 1)).join('')}
        </div>`;
    }

    const unassigned = users.filter(u => !u.org_id && u.is_active);
    el.innerHTML = `<div class="card">
      <div class="card-header"><div>
        <div class="card-header-t">조직 구조 관리</div>
        <div class="card-header-s">계층 구조로 조직을 정의하고 멤버를 배정합니다</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="showAddOrgModal()">+ 조직 추가</button></div>
      ${rootOrgs.map(org => renderOrgTree(org)).join('') || '<div class="alert alert-orange">등록된 조직이 없습니다.</div>'}
      <div style="margin-top:16px">
        <div style="font-size:13px;font-weight:500;color:var(--muted);margin-bottom:8px">조직 미배정 직원</div>
        ${unassigned.map(u => `
          <span style="font-size:12px;background:var(--o50);padding:3px 10px;border-radius:12px;margin:3px;display:inline-block">
            ${u.name} ${u.title||''}
            <button class="btn btn-sm" style="font-size:10px;margin-left:4px"
              onclick="assignOrgModal(${u.id},'${u.name}')">조직 배정</button>
          </span>`).join('') || '<span style="font-size:12px;color:var(--muted)">없음</span>'}
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

function showAddOrgModal(parentId) {
  showOrgModal({ id: null, name: '', leader_id: null, parent_id: parentId||null });
}

async function editOrg(id, name, leaderId, parentId) {
  showOrgModal({ id, name, leader_id: leaderId, parent_id: parentId });
}

async function showOrgModal(org) {
  document.getElementById('org-modal')?.remove();
  const [users, orgs] = await Promise.all([API.get('/users'), API.get('/organizations')]);
  const overlay = document.createElement('div');
  overlay.id = 'org-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:12px;padding:24px;width:100%;max-width:400px;margin:20px">
      <div style="font-size:15px;font-weight:600;margin-bottom:16px">${org.id ? '조직 편집' : '조직 추가'}</div>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">조직명 *</label>
        <input id="org-modal-name" value="${org.name||''}" placeholder="조직명 입력" style="width:100%;height:36px;font-size:13px">
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
    if (orgId) await API.put('/organizations/' + orgId, { name, leader_id, parent_id });
    else       await API.post('/organizations', { name, leader_id, parent_id });
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

/* ── loadOrgModes 표시 방식 수정: 조직명 기준 ── */

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
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-ghost btn-sm" onclick="_orgAutoArrange()">⚡ 자동 정렬</button>
      <button class="btn btn-ghost btn-sm" onclick="_orgSaveLayout()">💾 배치 저장</button>
      <button class="btn btn-ghost btn-sm" onclick="_orgFullscreen()">⛶ 전체화면</button>
      <span style="font-size:12px;color:var(--muted);align-self:center">
        노드 드래그=이동 · 하단 점 드래그=상위 연결 · 연결선 클릭=해제
      </span>
    </div>`;

  const wrap = document.createElement('div');
  wrap.id = 'org-chart-wrap';
  wrap.style.cssText = 'position:relative;width:100%;height:calc(100vh - 300px);min-height:320px;border:1px solid var(--border);border-radius:8px;overflow:auto;background:#f8f9fa';

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
    document.exitFullscreen().then(()=>{ wrap.style.height='calc(100vh - 300px)'; wrap.style.borderRadius='8px'; }).catch(()=>{});
  }
}

/* ── 최종평가 잠금 해제 (master 전용) ── */
async function unlockFinalEval(finalId, userName) {
  if (!confirm(`${userName}의 최종평가 잠금을 해제하시겠습니까?\n자기평가와 상사평가가 모두 초기화됩니다.`)) return;
  try {
    await API.post('/admin/final/' + finalId + '/unlock', {});
    showAlert(`${userName}의 최종평가가 초기화되었습니다.`, 'green');
    renderAdmStatus();
  } catch(e) { showAlert(e.message, 'red'); }
}

/* ── 평가 단계 강제 변경 모달 ── */
function showForcePhaseModal(evalId, userName, currentPhase) {
  document.getElementById('force-phase-modal')?.remove();
  const phases = [
    { value: 'draft',               label: '목표 작성중' },
    { value: 'pending',             label: '승인 대기' },
    { value: 'approved',            label: '목표 확정' },
    { value: 'rejected',            label: '반려됨' },
    { value: 'final_self',          label: '자기평가 중' },
    { value: 'final_mgr_pending',   label: '1차 상사평가 대기' },
    { value: 'final_mgr2_pending',  label: '2차 상사평가 대기' },
    { value: 'final_done',          label: '평가 완료 (잠금)' },
  ];
  const overlay = document.createElement('div');
  overlay.id = 'force-phase-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:12px;padding:24px;width:100%;max-width:400px;margin:20px">
      <div style="font-size:15px;font-weight:600;margin-bottom:6px">평가 단계 강제 변경</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px">${userName}</div>
      <div class="alert alert-red" style="font-size:12px;margin-bottom:14px">
        ⚠ 관리자 전용 기능입니다. 신중하게 사용하세요.
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px">변경할 단계 선택</label>
        <select id="force-phase-select" style="width:100%;height:38px;font-size:13px">
          ${phases.map(p =>
            `<option value="${p.value}" ${p.value===currentPhase?'selected':''}>${p.label}</option>`
          ).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('force-phase-modal').remove()">취소</button>
        <button class="btn btn-primary" onclick="forcePhaseChange(${evalId})">변경</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function forcePhaseChange(evalId) {
  const phase = document.getElementById('force-phase-select')?.value;
  if (!phase) return;
  if (!confirm(`정말로 평가 단계를 "${phase}"로 변경하시겠습니까?`)) return;
  try {
    await API.post('/admin/eval/' + evalId + '/force-phase', { phase });
    showAlert('평가 단계가 변경되었습니다.', 'green');
    document.getElementById('force-phase-modal')?.remove();
    renderAdmStatus();
  } catch(e) { showAlert(e.message, 'red'); }
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
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function renderAdmStatus(periodIds, includeInactive) {
  if (periodIds === undefined) periodIds = null;
  if (includeInactive === undefined) includeInactive = false;

  const el = document.getElementById('adm-status');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const allPeriods = await API.get('/eval-periods');
    const isAdmin = App.isAdmin();

    const qParts = [];
    if (periodIds) qParts.push('period_ids=' + periodIds);
    if (includeInactive && isAdmin) qParts.push('include_inactive=true');
    const qs = qParts.length ? '?' + qParts.join('&') : '';

    const data = await API.get('/admin/eval-status' + qs);
    if (!data || !data.users) throw new Error('데이터 형식 오류');

    const phaseLabel = {
      none:               { text:'미시작',        cls:'bd-draft'    },
      draft:              { text:'작성중',         cls:'bd-draft'    },
      pending:            { text:'승인 대기',      cls:'bd-pending'  },
      approved:           { text:'목표 확정',      cls:'bd-approved' },
      rejected:           { text:'반려됨',         cls:'bd-rejected' },
      final_self:         { text:'자기평가 중',    cls:'bd-fb'       },
      final_mgr_pending:  { text:'1차평가 대기',   cls:'bd-final'    },
      final_mgr2_pending: { text:'2차평가 대기',   cls:'bd-purple'   },
      final_done:         { text:'평가 완료',      cls:'bd-locked'   },
    };

    const wrap = document.createElement('div');

    // 컨트롤 영역
    const ctrlDiv = document.createElement('div');
    ctrlDiv.className = 'admin-status-controls';

    const activePeriods = allPeriods.filter(function(p) { return p.is_active == 1; });
    const inactivePeriods = allPeriods.filter(function(p) { return p.is_active != 1; });
    let periodOptHtml = '<option value="">전체 활성 (디폴트)</option>';
    activePeriods.forEach(function(p) {
      const sel = periodIds === String(p.id) ? ' selected' : '';
      periodOptHtml += '<option value="' + p.id + '"' + sel + '>' + p.period_label + ' (활성)</option>';
    });
    if (isAdmin && includeInactive && inactivePeriods.length) {
      periodOptHtml += '<option disabled>───────────</option>';
      inactivePeriods.forEach(function(p) {
        const sel = periodIds === String(p.id) ? ' selected' : '';
        periodOptHtml += '<option value="' + p.id + '"' + sel + '>' + p.period_label + ' (비활성)</option>';
      });
    }

    ctrlDiv.innerHTML = '<label style="font-size:13px;color:var(--muted)">조회 기간:</label>'
      + '<select id="admStatusPeriod" onchange="reloadAdmStatus()" style="height:32px;font-size:13px">'
      + periodOptHtml + '</select>'
      + (isAdmin
          ? '<label class="checkbox-inline"><input type="checkbox" id="admStatusIncludeInactive"'
            + (includeInactive ? ' checked' : '') + ' onchange="reloadAdmStatusInactive()">'
            + '<span style="font-size:13px">비활성 기간 포함</span></label>'
          : '');
    wrap.appendChild(ctrlDiv);

    // 통계 카드
    const s = data.stats;
    const summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:14px';
    [
      { label:'전체 직원', val: s.total_users,   color:'var(--o400)'   },
      { label:'목표 시작', val: s.started,       color:'var(--o500)'   },
      { label:'목표 확정', val: s.goal_approved, color:'var(--green)'  },
      { label:'평가 완료', val: s.final_done,    color:'var(--purple)' },
    ].forEach(function(c) {
      summaryDiv.innerHTML += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center"><div style="font-size:26px;font-weight:700;color:' + c.color + '">' + c.val + '</div><div style="font-size:12px;color:var(--muted);margin-top:3px">' + c.label + '</div></div>';
    });
    wrap.appendChild(summaryDiv);

    // 부서별 그룹
    const byDept = {};
    data.users.forEach(function(u) {
      const d = u.dept || '미배정';
      if (!byDept[d]) byDept[d] = [];
      byDept[d].push(u);
    });

    Object.entries(byDept).forEach(function([dept, members], idx) {
      const tableId = 'dept-tbl-' + idx;
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '10px';

      const hd = document.createElement('div');
      hd.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';
      hd.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:14px;font-weight:600">' + escapeHtml(dept) + '</span><span style="font-size:12px;color:var(--muted)">' + members.length + '명</span></div>';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn btn-ghost btn-sm';
      toggleBtn.style.fontSize = '12px';
      toggleBtn.textContent = '접기 ▲';
      toggleBtn.dataset.tableId = tableId;
      toggleBtn.onclick = function() { toggleDeptTable(tableId, this); };
      hd.appendChild(toggleBtn);
      card.appendChild(hd);

      const tableWrap = document.createElement('div');
      tableWrap.id = tableId;

      const tbl = document.createElement('table');
      tbl.className = 'tbl';
      tbl.innerHTML = '<thead><tr><th>이름</th><th>직책</th><th>평가 방식</th><th>평가 단계</th><th>기간</th><th style="text-align:center">목표</th><th style="text-align:center">피드백</th><th style="text-align:center">최종 점수</th><th></th><th></th><th></th></tr></thead><tbody></tbody>';
      const tbody = tbl.querySelector('tbody');

      members.forEach(function(u) {
        if (!u.cycles || u.cycles.length === 0) {
          const tr = document.createElement('tr');
          tr.innerHTML = '<td style="font-weight:500">' + escapeHtml(u.name) + '</td>'
            + '<td style="font-size:12px;color:var(--muted)">' + escapeHtml(u.title || '-') + '</td>'
            + '<td colspan="9" style="color:var(--muted);font-size:12px;text-align:center">선택 기간 데이터 없음</td>';
          tbody.appendChild(tr);
          return;
        }
        u.cycles.forEach(function(c) {
          const ph = phaseLabel[c.phase] || { text: c.phase || '미시작', cls: 'bd-draft' };
          const tr = document.createElement('tr');
          tr.style.cursor = 'pointer';
          tr.onclick = function() { renderEvalDetail(u.id, u.name); };

          const scoreHtml = c.final_score != null
            ? '<span style="font-weight:600;color:var(--o500)">' + Number(c.final_score).toFixed(1) + '점</span>'
              + (c.final_grade ? ' <span class="grade grade-' + c.final_grade + '">' + c.final_grade + '</span>' : '')
            : '<span style="color:var(--muted);font-size:12px">-</span>';

          const evalModeSelect = '<select style="font-size:11px;height:26px" onclick="event.stopPropagation()" onchange="changeUserEvalMode(' + u.id + ', this.value)">'
            + ['MBO','OKR','KPI'].map(function(m) {
                return '<option value="' + m + '"' + ((c.eval_mode||'MBO')===m?' selected':'') + '>' + m + '</option>';
              }).join('')
            + '</select>';

          tr.innerHTML = '<td style="font-weight:500">' + escapeHtml(u.name) + '</td>'
            + '<td style="font-size:12px;color:var(--muted)">' + escapeHtml(u.title || '-') + '</td>'
            + '<td>' + evalModeSelect + '</td>'
            + '<td><span class="bd ' + ph.cls + '">' + ph.text + '</span></td>'
            + '<td style="font-size:12px;color:var(--muted)">' + escapeHtml(c.period_label || '-') + '</td>'
            + '<td style="text-align:center;font-size:13px">' + (c.goal_count != null ? c.goal_count : '-') + '</td>'
            + '<td style="text-align:center;font-size:13px">' + (c.feedback_count != null ? c.feedback_count : '-') + '</td>'
            + '<td style="text-align:center">' + scoreHtml + '</td>'
            + '<td><button class="btn btn-ghost btn-sm" style="font-size:11px">상세</button></td>'
            + (c.eval_id ? '<td><button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--o600)">단계 변경</button></td>' : '<td></td>')
            + (c.phase === 'final_done' && c.final_eval_id && App.isMaster()
                ? '<td><button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;font-size:11px;padding:4px 8px">🔓 잠금 해제</button></td>'
                : '<td></td>');

          tr.querySelectorAll('button')[0].onclick = function(e) {
            e.stopPropagation();
            renderEvalDetail(u.id, u.name);
          };
          if (c.eval_id) {
            tr.querySelectorAll('button')[1].onclick = function(e) {
              e.stopPropagation();
              showForcePhaseModal(c.eval_id, u.name, c.phase || 'none');
            };
          }
          if (c.phase === 'final_done' && c.final_eval_id && App.isMaster()) {
            const btns = tr.querySelectorAll('button');
            btns[btns.length - 1].onclick = function(e) {
              e.stopPropagation();
              unlockFinalEval(c.final_eval_id, u.name);
            };
          }
          tbody.appendChild(tr);
        });
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

function reloadAdmStatus() {
  const periodId = document.getElementById('admStatusPeriod')?.value || '';
  const includeInactive = document.getElementById('admStatusIncludeInactive')?.checked || false;
  renderAdmStatus(periodId || null, includeInactive);
}

function reloadAdmStatusInactive() {
  const includeInactive = document.getElementById('admStatusIncludeInactive')?.checked || false;
  renderAdmStatus(null, includeInactive);
}


async function changeUserEvalMode(userId, mode) {
  try {
    const res = await API.patch('/users/' + userId + '/eval-mode', { mode });
    if (res.warning) showAlert(res.warning, 'orange');
    else showAlert('평가 방식이 변경되었습니다.', 'green');
  } catch(e) { showAlert(e.message, 'red'); }
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
      final_self:'자기평가 중', final_mgr_pending:'상사평가 대기',
      final_mgr2_pending:'2차 평가 대기', final_done:'평가 완료'
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
    const [histVis, histInactive, fbLimit, apprEdit, secondFinal, timezone, evalMode, notice, sessionPolicy, dashDepth] = await Promise.all([
      API.get('/settings/history-visibility'),
      API.get('/settings/history-inactive'),
      API.get('/settings/feedback-limit'),
      API.get('/settings/approval-edit'),
      API.get('/settings/second-final'),
      API.get('/settings/timezone'),
      API.get('/settings/eval-mode'),
      fetch('/api/notice').then(r => r.json()).catch(() => ({ content: '', author_name: '', updated_at: '' })),
      API.get('/settings/session-policy').catch(() => ({ close_on_browser_close: false, timeout_minutes: 480 })),
      API.get('/settings/dashboard-depth').catch(() => ({ depth: 2 })),
    ]);

    _sessionPolicyCache = Object.assign({}, sessionPolicy);

    el.innerHTML = `<div class="card">
      <div class="card-header"><div>
        <div class="card-header-t">평가 정책 설정</div>
        <div class="card-header-s">전사 평가 운영 정책을 관리합니다</div>
      </div>
      <button class="btn btn-sm policy-save-btn"
        style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.4);font-size:13px;white-space:nowrap"
        onclick="saveAllPolicy()">저장하기</button></div>

      <!-- 공지사항 편집 -->
      <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:2px solid var(--o100)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:14px;font-weight:600">📢 로그인 화면 공지사항</div>
            ${notice.author_name
              ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">최근 수정: ${notice.author_name} · ${(notice.updated_at||'').slice(0,16)}</div>`
              : ''}
          </div>
          <button class="btn btn-primary btn-sm" onclick="saveNotice()">저장하기</button>
        </div>
        <textarea id="notice-textarea"
          placeholder="로그인 화면에 표시할 공지사항을 입력하세요..."
          style="width:100%;min-height:120px;font-size:13px;resize:vertical;padding:10px;border-radius:6px;border:1px solid var(--border)"
        >${(notice.content||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">공지 내용이 없으면 로그인 화면에 공지 영역이 표시되지 않습니다.</div>
      </div>

      <!-- 4개 정책 그룹 -->
      <div class="policy-tab">

        <!-- 🛡️ 보안 설정 -->
        <div class="policy-group">
          <div class="policy-group-header">🛡️ 보안 설정</div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">🚪</span>브라우저 종료 시 자동 로그아웃</div>
            <div class="policy-options" data-policy-group="close_on_browser_close">
              <button class="btn-policy-option ${sessionPolicy.close_on_browser_close ? 'btn-primary' : 'btn-ghost'}"
                      onclick="setSessionPref('close_on_browser_close',true,this)">켜짐</button>
              <button class="btn-policy-option ${!sessionPolicy.close_on_browser_close ? 'btn-primary' : 'btn-ghost'}"
                      onclick="setSessionPref('close_on_browser_close',false,this)">꺼짐</button>
            </div>
            <div class="policy-description">탭/브라우저 닫으면 즉시 세션 만료</div>
          </div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">⏱️</span>세션 유지 시간</div>
            <div class="policy-options" data-policy-group="session_timeout">
              ${[5,10,30,60].map(m =>
                `<button class="btn-policy-option ${sessionPolicy.timeout_minutes===m ? 'btn-primary' : 'btn-ghost'}"
                         onclick="setSessionPref('timeout_minutes',${m},this)">${m>=60?m/60+'시간':m+'분'}</button>`
              ).join('')}
              <span style="display:inline-flex;align-items:center;gap:4px">
                <input id="session-custom-hours" type="number" min="1" max="8" placeholder="직접"
                  style="width:60px;height:32px;font-size:12px;text-align:center;border:1px solid #ddd;border-radius:4px"
                  onchange="if(this.value){var m=Math.min(Math.round(parseFloat(this.value)*60),480);setSessionPref('timeout_minutes',m,null)}">
                <span style="font-size:12px;color:var(--muted)">시간</span>
              </span>
            </div>
            <div class="policy-description">최대 8시간 · 현재: ${sessionPolicy.timeout_minutes>=60?Math.round(sessionPolicy.timeout_minutes/60)+'시간':sessionPolicy.timeout_minutes+'분'}</div>
          </div>
        </div>

        <!-- 📊 표시 및 권한 -->
        <div class="policy-group">
          <div class="policy-group-header">📊 표시 및 권한</div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">🏢</span>대시보드 표시 계층</div>
            <div class="policy-options" data-policy-group="dashboard_depth">
              ${[1,2,3].map(d =>
                `<button class="btn-policy-option ${dashDepth.depth===d ? 'btn-primary' : 'btn-ghost'}"
                         onclick="setPolicyState('dashboard_depth',${d},this)">${d}단계${d===2?' (기본)':d===3?' (옵션)':''}</button>`
              ).join('')}
              <button class="btn-policy-option" disabled style="opacity:.4;cursor:default">4단계 이상 미지원</button>
            </div>
            <div class="policy-description">성과관리 홈에서 조직 성과를 몇 단계까지 표시할지 설정</div>
          </div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">🔒</span>최종 평가 잠금</div>
            <div class="policy-options">
              <span class="bd bd-locked" style="padding:5px 10px;font-size:12px">항상 잠금</span>
            </div>
            <div class="policy-description">확정 후 인사팀 외 수정 불가</div>
          </div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">📋</span>직원 목표승인 이력 공개</div>
            <div class="policy-options" data-policy-group="history_visibility">
              <button class="btn-policy-option ${histVis.enabled ? 'btn-primary' : 'btn-ghost'}"
                      onclick="setPolicyState('history_visibility',true,this)">켜짐</button>
              <button class="btn-policy-option ${!histVis.enabled ? 'btn-primary' : 'btn-ghost'}"
                      onclick="setPolicyState('history_visibility',false,this)">꺼짐</button>
            </div>
            <div class="policy-description">직원이 본인의 과거 승인/반려 이력 열람 허용</div>
            <div class="policy-sub-item" style="grid-column:1/-1;${!histVis.enabled?'opacity:.4;pointer-events:none':''}">
              <div class="policy-item">
                <div class="policy-title"><span class="policy-emoji">📂</span>비활성 기간 이력도 공개</div>
                <div class="policy-options" data-policy-group="history_inactive">
                  <button class="btn-policy-option ${histInactive.enabled ? 'btn-primary' : 'btn-ghost'}"
                          onclick="setPolicyState('history_inactive',true,this)">켜짐 (전체)</button>
                  <button class="btn-policy-option ${!histInactive.enabled ? 'btn-primary' : 'btn-ghost'}"
                          onclick="setPolicyState('history_inactive',false,this)">꺼짐 (활성만)</button>
                </div>
                <div class="policy-description">켜짐: 활성/비활성 기간 모두 · 꺼짐: 활성 기간만</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 📝 평가 워크플로우 -->
        <div class="policy-group">
          <div class="policy-group-header">📝 평가 워크플로우</div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">💬</span>중간 피드백 횟수 제한</div>
            <div class="policy-options" data-policy-group="fb_limit">
              ${[{value:0,label:'무제한'},{value:1,label:'1회'},{value:2,label:'2회'},{value:3,label:'3회'},{value:5,label:'5회'},{value:10,label:'10회'},{value:20,label:'20회'}].map(o =>
                `<button class="btn-policy-option ${fbLimit.limit===o.value ? 'btn-primary' : 'btn-ghost'}"
                         onclick="setPolicyState('fb_limit',${o.value},this)">${o.label}</button>`
              ).join('')}
            </div>
            <div class="policy-description">승인자별 피드백 제출 가능 횟수</div>
          </div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">👥</span>1차 상사 피드백</div>
            <div class="policy-options">
              <span class="bd bd-approved" style="padding:5px 10px;font-size:12px">의무/선택 분리 적용 중</span>
            </div>
            <div class="policy-description">1차 직속 상사 의무 · 2차 이상 선택</div>
          </div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">✏️</span>승인자 승인 수정/취소 허용</div>
            <div class="policy-options" data-policy-group="approver_edit">
              <button class="btn-policy-option ${apprEdit.enabled ? 'btn-primary' : 'btn-ghost'}"
                      onclick="setPolicyState('approver_edit',true,this)">켜짐</button>
              <button class="btn-policy-option ${!apprEdit.enabled ? 'btn-primary' : 'btn-ghost'}"
                      onclick="setPolicyState('approver_edit',false,this)">꺼짐</button>
            </div>
            <div class="policy-description">켜짐: 승인자가 본인의 승인을 수정/취소 가능</div>
          </div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">⭐</span>2차 최종평가 허용</div>
            <div class="policy-options" data-policy-group="second_final">
              <button class="btn-policy-option ${secondFinal.enabled ? 'btn-primary' : 'btn-ghost'}"
                      onclick="setPolicyState('second_final',true,this)">켜짐</button>
              <button class="btn-policy-option ${!secondFinal.enabled ? 'btn-primary' : 'btn-ghost'}"
                      onclick="setPolicyState('second_final',false,this)">꺼짐</button>
            </div>
            <div class="policy-description">켜짐: 1차 위 상위 승인자도 최종평가 가능 · 꺼짐: 1차(직속 상사)만 평가</div>
          </div>
        </div>

        <!-- 🔧 평가 운영 -->
        <div class="policy-group">
          <div class="policy-group-header">🔧 평가 운영</div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">📊</span>평가 방식 설정</div>
            <div class="policy-options">
              <button class="btn-policy-option btn-ghost" onclick="switchAdmTab('adm-periods')">평가기간 관리 →</button>
            </div>
            <div class="policy-description">평가방식은 <strong>평가기간 관리</strong> 탭에서 기간별/조직별로 설정하세요</div>
          </div>

          <div class="policy-item">
            <div class="policy-title"><span class="policy-emoji">🌐</span>시스템 시간대</div>
            <div class="policy-options">
              <select id="tz-select" class="btn-policy-option btn-ghost" style="height:34px;font-size:13px;padding:4px 8px"
                      onchange="setPolicyState('timezone',this.value,null)">
                <optgroup label="아시아">
                  <option value="Asia/Seoul"     ${timezone.timezone==='Asia/Seoul'    ?'selected':''}>한국 (KST, UTC+9)</option>
                  <option value="Asia/Tokyo"     ${timezone.timezone==='Asia/Tokyo'    ?'selected':''}>일본 (JST, UTC+9)</option>
                  <option value="Asia/Shanghai"  ${timezone.timezone==='Asia/Shanghai' ?'selected':''}>중국 (CST, UTC+8)</option>
                  <option value="Asia/Singapore" ${timezone.timezone==='Asia/Singapore'?'selected':''}>싱가포르 (SGT, UTC+8)</option>
                  <option value="Asia/Bangkok"   ${timezone.timezone==='Asia/Bangkok'  ?'selected':''}>태국 (ICT, UTC+7)</option>
                  <option value="Asia/Dubai"     ${timezone.timezone==='Asia/Dubai'    ?'selected':''}>UAE (GST, UTC+4)</option>
                </optgroup>
                <optgroup label="유럽">
                  <option value="Europe/London"  ${timezone.timezone==='Europe/London' ?'selected':''}>영국 (GMT, UTC+0)</option>
                  <option value="Europe/Paris"   ${timezone.timezone==='Europe/Paris'  ?'selected':''}>프랑스 (CET, UTC+1)</option>
                  <option value="Europe/Berlin"  ${timezone.timezone==='Europe/Berlin' ?'selected':''}>독일 (CET, UTC+1)</option>
                </optgroup>
                <optgroup label="아메리카">
                  <option value="America/New_York"    ${timezone.timezone==='America/New_York'    ?'selected':''}>미국 동부 (EST, UTC-5)</option>
                  <option value="America/Chicago"     ${timezone.timezone==='America/Chicago'     ?'selected':''}>미국 중부 (CST, UTC-6)</option>
                  <option value="America/Los_Angeles" ${timezone.timezone==='America/Los_Angeles' ?'selected':''}>미국 서부 (PST, UTC-8)</option>
                </optgroup>
                <optgroup label="오세아니아">
                  <option value="Australia/Sydney"  ${timezone.timezone==='Australia/Sydney' ?'selected':''}>호주 시드니 (AEST, UTC+10)</option>
                  <option value="Pacific/Auckland"  ${timezone.timezone==='Pacific/Auckland' ?'selected':''}>뉴질랜드 (NZST, UTC+12)</option>
                </optgroup>
                <optgroup label="기타">
                  <option value="UTC" ${timezone.timezone==='UTC'?'selected':''}>UTC (협정세계시, UTC+0)</option>
                </optgroup>
              </select>
            </div>
            <div class="policy-description">로그 및 기록 시간의 기준 시간대 (운영 주체 기준)</div>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:2px solid var(--o100)">
        <button class="btn btn-ghost policy-save-btn" style="min-width:160px"
          onclick="saveAllPolicy()">저장하기</button>
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

async function saveAllPolicy() {
  // 공지사항은 항상 저장 (textarea)
  const noticeText = document.getElementById('notice-textarea')?.value;
  const hasNotice = noticeText !== undefined;

  if (!_policyDirty && Object.keys(_policyState).length === 0 && !hasNotice) {
    showAlert('변경된 설정이 없습니다.', 'orange'); return;
  }
  try {
    const promises = [];
    if ('fb_limit'            in _policyState) promises.push(API.post('/settings/feedback-limit',     { limit:   _policyState.fb_limit }));
    if ('history_visibility'  in _policyState) promises.push(API.post('/settings/history-visibility', { enabled: _policyState.history_visibility }));
    if ('history_inactive'    in _policyState) promises.push(API.post('/settings/history-inactive',   { enabled: _policyState.history_inactive }));
    if ('approver_edit'       in _policyState) promises.push(API.post('/settings/approval-edit',      { enabled: _policyState.approver_edit }));
    if ('second_final'        in _policyState) promises.push(API.post('/settings/second-final',       { enabled: _policyState.second_final }));
    if ('timezone'            in _policyState) promises.push(API.post('/settings/timezone',            { timezone: _policyState.timezone }));
    if ('session_policy'      in _policyState) promises.push(API.post('/settings/session-policy',     _policyState.session_policy));
    if ('dashboard_depth'     in _policyState) promises.push(API.post('/settings/dashboard-depth',    { depth: _policyState.dashboard_depth }));
    if ('eval_mode'           in _policyState) promises.push(API.post('/settings/eval-mode',           { mode: _policyState.eval_mode }));
    await Promise.all(promises);
    if (hasNotice) await API.post('/notice', { content: noticeText });

    const cnt = Object.keys(_policyState).length + (hasNotice ? 1 : 0);
    showAlert(`${cnt}개 설정이 저장되었습니다.`, 'green');
    _policyState = {}; _policyDirty = false;
    document.querySelectorAll('.policy-save-btn').forEach(b => {
      b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); b.innerHTML = '저장하기';
    });
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
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

async function saveTimezone() {
  const tz = document.getElementById('tz-select')?.value;
  if (!tz) return;
  try {
    await API.post('/settings/timezone', { timezone: tz });
    showAlert(`시간대가 "${tz}"로 변경되었습니다. 서버 재시작 없이 즉시 적용됩니다.`, 'green');
  } catch(e) { showAlert(e.message, 'red'); }
}

async function saveNotice() {
  const content = document.getElementById('notice-textarea')?.value || '';
  try {
    const r = await API.post('/notice', { content });
    showAlert(`공지사항이 저장되었습니다. (저장자: ${r.author_name||''})`, 'green');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}

let _sessionTimeoutSel = null;

function selectSessionTimeout(minutes, btn) {
  _sessionTimeoutSel = minutes;
  document.querySelectorAll('.session-timeout-btn').forEach(b => {
    b.classList.remove('btn-primary'); b.classList.add('btn-ghost');
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

async function saveDashDepth(depth) {
  try {
    await API.post('/settings/dashboard-depth', { depth });
    showAlert(`대시보드 계층이 ${depth}단계로 설정되었습니다.`, 'green');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}

async function setGlobalEvalMode(mode) {
  try {
    await API.post('/settings/eval-mode', { mode });
    showAlert(`전사 기본 평가 방식이 ${mode}로 변경되었습니다.`, 'green');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}

/* ── 등급 정책 관리 ── */
async function renderGradePolicies() {
  const el = document.getElementById('adm-grade-policies');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const policies = await API.get('/grade-policies');
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-header-t">등급 정책 관리</div>
            <div class="card-header-s">등급별 100점 환산 기준을 정의합니다. 평가 기간에 바인딩된 정책의 cutoff는 수정 불가합니다.</div>
          </div>
          <button class="btn btn-primary" onclick="openCreatePolicyModal()">+ 신규 정책 등록</button>
        </div>
        <div id="policy-list" style="margin-top:8px">
          ${policies.length === 0
            ? '<div class="alert alert-orange">등록된 등급 정책이 없습니다. 신규 정책을 등록해 주세요.</div>'
            : policies.map(p => renderPolicyCard(p)).join('')}
        </div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

function renderPolicyCard(p) {
  const isLocked = p.applied_periods && p.applied_periods.length > 0;
  const appliedLabel = isLocked
    ? `<span class="bd bd-locked" style="font-size:11px">${p.applied_periods.length}개 기간 적용 중 🔒</span>`
    : `<span class="bd bd-draft" style="font-size:11px">미바인딩</span>`;
  const criteria = p.criteria || [];

  return `
    <div class="period-card" data-policy-id="${p.id}" style="margin-bottom:8px">
      <div class="period-card-header" onclick="togglePolicyCard(${p.id})">
        <span class="toggle-icon" id="policyToggle_${p.id}">▶</span>
        <strong style="font-size:14px">${escapeHtml(p.name)}</strong>
        ${appliedLabel}
        <span style="color:var(--muted);font-size:12px">${criteria.length}개 등급</span>
        <div style="margin-left:auto;display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); openEditPolicyModal(${p.id})">
            ${isLocked ? '이름·설명 수정' : '편집'}
          </button>
          <button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;padding:3px 8px;font-size:11px" onclick="event.stopPropagation(); confirmDeletePolicy(${p.id})">삭제</button>
        </div>
      </div>
      <div class="period-card-body" id="policyBody_${p.id}" style="display:none">
        ${p.description ? `<div style="font-size:13px;color:var(--muted);margin-bottom:10px">${escapeHtml(p.description)}</div>` : ''}
        <table class="tbl" style="margin-bottom:12px">
          <thead><tr>
            <th style="width:55px;text-align:center">순위</th>
            <th style="width:90px">등급코드</th>
            <th style="width:160px">등급명</th>
            <th style="width:90px">min_score</th>
            <th>등급 정의</th>
          </tr></thead>
          <tbody>
            ${criteria.map(c => `
              <tr>
                <td style="text-align:center">${c.sort_order}</td>
                <td><strong>${escapeHtml(c.grade_code)}</strong></td>
                <td>${escapeHtml(c.grade_name)}</td>
                <td><strong style="color:var(--o500)">${c.min_score}</strong></td>
                <td style="font-size:12px">
                  <div style="color:var(--muted)">${escapeHtml(c.description || '')}</div>
                  ${c.detail_desc ? `<div style="max-height:60px;overflow-y:auto;white-space:pre-line;font-size:11px;color:var(--o700);margin-top:3px;padding:3px 5px;background:var(--o50);border-radius:4px"><span style="font-size:10px;color:var(--o400);font-weight:600;display:block;margin-bottom:2px">상세</span>${escapeHtml(c.detail_desc)}</div>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${p.applied_periods && p.applied_periods.length ? `
          <div style="padding-top:10px;border-top:1px solid var(--o100)">
            <div style="font-size:12px;color:var(--muted);margin-bottom:5px">적용 중인 평가 기간 (${p.applied_periods.length}개)</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${p.applied_periods.map(ep => `
                <span class="bd ${ep.is_active ? 'bd-approved' : 'bd-draft'}" style="font-size:11px">
                  ${ep.eval_year}년 ${escapeHtml(ep.period_label)}${ep.is_active ? '' : ' (비활성)'}
                </span>`).join('')}
            </div>
          </div>` : ''}
      </div>
    </div>`;
}

function togglePolicyCard(policyId) {
  const body = document.getElementById(`policyBody_${policyId}`);
  const icon = document.getElementById(`policyToggle_${policyId}`);
  if (!body || !icon) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  icon.textContent = isOpen ? '▶' : '▼';
}

async function openCreatePolicyModal() {
  const defaultCriteria = [
    { sort_order: 1, grade_code: 'OI', grade_name: '탁월', min_score: 90, description: '' },
    { sort_order: 2, grade_code: 'EX', grade_name: '우수', min_score: 75, description: '' },
    { sort_order: 3, grade_code: 'ME', grade_name: '충족', min_score: 60, description: '' },
    { sort_order: 4, grade_code: 'IM', grade_name: '개선필요', min_score: 40, description: '' },
    { sort_order: 5, grade_code: 'NI', grade_name: '미흡', min_score: 20, description: '' },
    { sort_order: 6, grade_code: 'IR', grade_name: '부적격', min_score: 0, description: '' },
  ];
  _openPolicyModal(null, defaultCriteria);
}

async function openEditPolicyModal(policyId) {
  try {
    const policies = await API.get('/grade-policies');
    const policy = policies.find(p => p.id === policyId);
    if (!policy) { showAlert('정책을 찾을 수 없습니다.', 'red'); return; }
    _openPolicyModal(policy, policy.criteria || []);
  } catch(e) { showAlert(e.message, 'red'); }
}

function _openPolicyModal(policy, criteria) {
  const isEdit = !!policy;
  const isLocked = isEdit && policy.applied_periods && policy.applied_periods.length > 0;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'policyModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:720px">
      <div class="modal-header">
        <h3>${isEdit ? '등급 정책 편집' : '신규 등급 정책 등록'}</h3>
        <button class="modal-close" onclick="document.getElementById('policyModal').remove()">×</button>
      </div>
      <div class="modal-body">
        ${isLocked ? `
          <div class="alert alert-orange" style="margin-bottom:15px">
            🔒 이 정책은 <strong>${policy.applied_periods.length}개 평가 기간</strong>에 적용 중이므로
            <strong>cutoff(등급 기준)</strong>를 수정할 수 없습니다.
            이름·설명·등급 정의·등급 상세 설명은 자유롭게 수정 가능합니다. cutoff 변경이 필요하면
            <button class="btn btn-ghost btn-sm" style="display:inline;padding:2px 8px" onclick="cloneAsNewPolicy(${policy.id})">새 정책으로 복제</button>하세요.
          </div>` : ''}
        <div style="margin-bottom:12px">
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">정책 이름 *</label>
          <input type="text" id="editPolicyName" value="${isEdit ? escapeHtml(policy.name) : ''}" placeholder="예: 사이냅 표준안 v2" style="width:100%;height:36px;font-size:14px">
        </div>
        <div style="margin-bottom:16px">
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">설명</label>
          <textarea id="editPolicyDesc" rows="2" style="width:100%;font-size:13px;resize:vertical">${isEdit ? escapeHtml(policy.description || '') : ''}</textarea>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--o800);display:block;margin-bottom:4px">
            등급 cutoff ${isLocked ? '(잠금 — 수정 불가)' : ''}
          </label>
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">sort_order 1이 가장 높은 등급. min_score는 0~100 범위, 단조감소해야 합니다.</div>
          <div style="overflow-x:auto">
            <table class="tbl" id="editCriteriaTable">
              <thead><tr>
                <th style="width:60px">순위</th>
                <th style="width:80px">등급코드</th>
                <th style="width:120px">등급명</th>
                <th style="width:90px">min_score</th>
                <th>등급 정의</th>
                ${isLocked ? '' : '<th style="width:40px"></th>'}
              </tr></thead>
              <tbody>
                ${criteria.map(c => `
                  <tr data-criteria-id="${c.id || ''}">
                    <td><input type="number" value="${c.sort_order}" min="1" ${isLocked ? 'readonly' : ''} class="criteria-sort" style="width:50px;height:28px;font-size:12px;text-align:center"></td>
                    <td><input type="text" value="${escapeHtml(c.grade_code)}" ${isLocked ? 'readonly' : ''} class="criteria-code" style="width:70px;height:28px;font-size:12px"></td>
                    <td><input type="text" value="${escapeHtml(c.grade_name)}" ${isLocked ? 'readonly' : ''} class="criteria-name" style="width:110px;height:28px;font-size:12px"></td>
                    <td><input type="number" value="${c.min_score}" min="0" max="100" step="0.01" ${isLocked ? 'readonly' : ''} class="criteria-min" style="width:80px;height:28px;font-size:12px"></td>
                    <td><input type="text" value="${escapeHtml(c.description || '')}" class="criteria-desc" style="width:100%;height:28px;font-size:12px" placeholder="짧은 정의"></td>
                    ${isLocked ? '' : '<td><button class="btn btn-sm" style="background:none;border:none;color:#A32D2D;padding:2px 4px;font-size:14px;cursor:pointer" onclick="removeCriteriaRow(this)" title="삭제">×</button></td>'}
                  </tr>
                  <tr>
                    <td colspan="${isLocked ? 5 : 6}" style="padding-top:0;padding-bottom:10px">
                      <textarea class="criteria-detail-desc" rows="2"
                        style="width:100%;font-size:12px;resize:vertical;border:1px solid var(--border);border-radius:4px;padding:4px 6px"
                        placeholder="등급 상세 설명 (정의·행동특성·판단기준 등 상세 루브릭)">${escapeHtml(c.detail_desc || '')}</textarea>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${isLocked ? '' : `<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="addCriteriaRow()">+ 등급 추가</button>`}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('policyModal').remove()">취소</button>
        <button class="btn btn-primary" onclick="savePolicyEdit(${isEdit ? policy.id : 'null'}, ${isLocked})">저장</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function addCriteriaRow() {
  const tbody = document.querySelector('#editCriteriaTable tbody');
  if (!tbody) return;
  const dataRows = tbody.querySelectorAll('tr[data-criteria-id]');
  const nextOrder = dataRows.length + 1;
  const tr = document.createElement('tr');
  tr.setAttribute('data-criteria-id', '');
  tr.innerHTML = `
    <td><input type="number" value="${nextOrder}" min="1" class="criteria-sort" style="width:50px;height:28px;font-size:12px;text-align:center"></td>
    <td><input type="text" value="" class="criteria-code" style="width:70px;height:28px;font-size:12px"></td>
    <td><input type="text" value="" class="criteria-name" style="width:110px;height:28px;font-size:12px"></td>
    <td><input type="number" value="0" min="0" max="100" step="0.01" class="criteria-min" style="width:80px;height:28px;font-size:12px"></td>
    <td><input type="text" value="" class="criteria-desc" style="width:100%;height:28px;font-size:12px" placeholder="짧은 정의"></td>
    <td><button class="btn btn-sm" style="background:none;border:none;color:#A32D2D;padding:2px 4px;font-size:14px;cursor:pointer" onclick="removeCriteriaRow(this)" title="삭제">×</button></td>`;
  tbody.appendChild(tr);
  const tr2 = document.createElement('tr');
  tr2.innerHTML = `
    <td colspan="6" style="padding-top:0;padding-bottom:10px">
      <textarea class="criteria-detail-desc" rows="2"
        style="width:100%;font-size:12px;resize:vertical;border:1px solid var(--border);border-radius:4px;padding:4px 6px"
        placeholder="등급 상세 설명 (정의·행동특성·판단기준 등 상세 루브릭)"></textarea>
    </td>`;
  tbody.appendChild(tr2);
}

function removeCriteriaRow(btn) {
  const tr = btn.closest('tr');
  const next = tr.nextElementSibling;
  if (next && !next.hasAttribute('data-criteria-id')) next.remove();
  tr.remove();
}

async function savePolicyEdit(policyId, isLocked) {
  const name = document.getElementById('editPolicyName')?.value.trim();
  const description = document.getElementById('editPolicyDesc')?.value.trim() || '';

  if (!name) { showAlert('정책 이름은 필수입니다.', 'orange'); return; }

  const body = { name, description };

  if (!isLocked) {
    const rows = document.querySelectorAll('#editCriteriaTable tbody tr[data-criteria-id]');
    const criteria = [];
    for (const row of rows) {
      const code = row.querySelector('.criteria-code')?.value.trim();
      const gname = row.querySelector('.criteria-name')?.value.trim();
      if (!code || !gname) { showAlert('등급코드와 등급명은 필수입니다.', 'orange'); return; }
      const detailRow = row.nextElementSibling;
      criteria.push({
        sort_order:  parseInt(row.querySelector('.criteria-sort')?.value) || 1,
        grade_code:  code,
        grade_name:  gname,
        min_score:   parseFloat(row.querySelector('.criteria-min')?.value) || 0,
        description: row.querySelector('.criteria-desc')?.value.trim() || '',
        detail_desc: detailRow?.querySelector('.criteria-detail-desc')?.value.trim() || '',
      });
    }
    if (criteria.length < 2) { showAlert('등급은 최소 2개 이상 필요합니다.', 'orange'); return; }
    body.criteria = criteria;
  }

  try {
    if (policyId === null) {
      await API.post('/grade-policies', body);
      showAlert('등급 정책이 등록되었습니다.', 'green');
    } else {
      await API.put('/grade-policies/' + policyId, body);
      // 잠금 상태에서도 등급 정의·상세 설명 업데이트
      if (isLocked) {
        const rows = document.querySelectorAll('#editCriteriaTable tbody tr[data-criteria-id]');
        const updates = [];
        for (const row of rows) {
          const cid = row.getAttribute('data-criteria-id');
          if (!cid) continue;
          const detailRow = row.nextElementSibling;
          updates.push({
            id:          parseInt(cid),
            description: row.querySelector('.criteria-desc')?.value.trim() || '',
            detail_desc: detailRow?.querySelector('.criteria-detail-desc')?.value.trim() || '',
          });
        }
        if (updates.length) await API.patch('/grade-policies/' + policyId + '/criteria-desc', { updates });
      }
      showAlert('저장되었습니다.', 'green');
    }
    document.getElementById('policyModal')?.remove();
    renderGradePolicies();
  } catch(e) { showAlert(e.message || '저장 실패', 'red'); }
}

async function confirmDeletePolicy(policyId) {
  try {
    const policies = await API.get('/grade-policies');
    const policy = policies.find(p => p.id === policyId);
    if (!policy) return;

    let msg = `정책 "${policy.name}"을(를) 삭제하시겠습니까?`;
    if (policy.applied_periods && policy.applied_periods.length > 0) {
      msg += `\n\n⚠️ 이 정책은 ${policy.applied_periods.length}개 평가 기간에 적용 중입니다. 삭제 시 해당 기간들은 자동으로 비활성화되며 등급 정책이 해제됩니다.`;
    }
    if (!confirm(msg)) return;

    const result = await API.del('/grade-policies/' + policyId);
    showAlert(result.message || '삭제되었습니다.', 'green');
    renderGradePolicies();
  } catch(e) { showAlert(e.message || '삭제 실패', 'red'); }
}

async function cloneAsNewPolicy(policyId) {
  try {
    const policies = await API.get('/grade-policies');
    const policy = policies.find(p => p.id === policyId);
    if (!policy) return;
    document.getElementById('policyModal')?.remove();
    const cloned = {
      name: policy.name + ' (복사본)',
      description: policy.description || '',
      criteria: (policy.criteria || []).map(c => ({ ...c })),
    };
    _openPolicyModal(null, cloned.criteria);
    setTimeout(() => {
      const nameEl = document.getElementById('editPolicyName');
      if (nameEl) nameEl.value = cloned.name;
      const descEl = document.getElementById('editPolicyDesc');
      if (descEl) descEl.value = cloned.description;
    }, 50);
  } catch(e) { showAlert(e.message, 'red'); }
}


/* ── 평가 기간 관리 ── */
let _availableYears = null;

async function loadAvailableYears(includeInactive) {
  try {
    const result = await API.get('/eval-periods/available-years?include_inactive=' + (includeInactive ? 'true' : 'false'));
    _availableYears = (result.years && result.years.length > 0) ? result.years : [new Date().getFullYear()];
    return _availableYears;
  } catch(err) {
    console.error('연도 목록 로드 실패:', err);
    return [new Date().getFullYear()];
  }
}

function renderYearOptions(years, selectedYear) {
  return years.map(function(y) {
    return '<option value="' + y + '"' + (selectedYear === y ? ' selected' : '') + '>' + y + '년</option>';
  }).join('');
}

async function renderAdmPeriods(yearFrom, yearTo, includeInactive) {
  if (yearFrom === undefined) yearFrom = null;
  if (yearTo === undefined) yearTo = null;
  if (includeInactive === undefined) includeInactive = false;

  const el = document.getElementById('adm-periods');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';

  try {
    // 드롭다운 연도 옵션은 항상 전체 연도 (비활성 포함)
    const years = await loadAvailableYears(true);
    const maxYear = years.length > 0 ? years[0] : new Date().getFullYear();
    const minYear = years.length > 0 ? years[years.length - 1] : maxYear;
    const selFrom = yearFrom !== null ? yearFrom : minYear;
    const selTo   = yearTo   !== null ? yearTo   : maxYear;

    // 기간 목록: year 인자 없으면 전체 반환
    const qParts = [];
    if (yearFrom !== null) qParts.push('year_from=' + yearFrom);
    if (yearTo   !== null) qParts.push('year_to='   + yearTo);
    if (includeInactive)   qParts.push('include_inactive=true');
    let [rawPeriods, gradePolicies] = await Promise.all([
      API.get('/eval-periods' + (qParts.length ? '?' + qParts.join('&') : '')),
      API.get('/grade-policies').catch(() => []),
    ]);
    // 최신 분기 우선 정렬 (하반기→4분기→3분기→상반기→2분기→1분기, 연도 DESC)
    const periods = typeof sortPeriodsDesc === 'function' ? sortPeriodsDesc(rawPeriods) : rawPeriods;

    el.innerHTML = '';

    // 조회 범위 컨트롤
    const ctrlDiv = document.createElement('div');
    ctrlDiv.className = 'period-mgr-controls';
    ctrlDiv.style.marginBottom = '12px';

    const fromOptHtml = renderYearOptions(years, selFrom);
    const toOptHtml   = renderYearOptions(years, selTo);

    ctrlDiv.innerHTML = '<label style="font-size:13px;color:var(--muted)">조회 범위:</label>'
      + '<select id="periodYearFrom" onchange="reloadEvalPeriods()" style="height:32px;font-size:13px">' + fromOptHtml + '</select>'
      + '<span style="font-size:13px;padding:0 4px">~</span>'
      + '<select id="periodYearTo" onchange="reloadEvalPeriods()" style="height:32px;font-size:13px">' + toOptHtml + '</select>'
      + '<button class="btn btn-ghost btn-sm" onclick="reloadEvalPeriods()">조회</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="toggleAllPeriods(\'expand\')" style="margin-left:8px">전체 펼치기</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="toggleAllPeriods(\'collapse\')">전체 접기</button>'
      + '<small style="color:var(--muted);font-size:11px;margin-left:4px">기본 전체 표시. 최대 10년.</small>';
    el.appendChild(ctrlDiv);

    // 새 기간 추가 카드
    const addCard = document.createElement('div');
    addCard.className = 'card';
    addCard.innerHTML = '<div class="card-header"><div>'
      + '<div class="card-header-t">평가 기간 관리</div>'
      + '<div class="card-header-s">활성화된 기간만 직원들이 목표를 작성할 수 있습니다</div>'
      + '</div></div>'
      + '<div style="background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:14px;margin-bottom:16px">'
      + '<div style="font-size:13px;font-weight:500;margin-bottom:10px;color:var(--o800)">새 평가 기간 추가</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">'
      + '<div style="flex:1;min-width:100px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">연도</label>'
      + '<select id="np-year" style="height:34px;font-size:13px;width:100%"><option>2024년</option><option selected>2025년</option><option>2026년</option><option>2027년</option></select></div>'
      + '<div style="flex:1;min-width:100px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">구분</label>'
      + '<select id="np-type" onchange="updatePeriodLabel()" style="height:34px;font-size:13px;width:100%"><option value="q">분기</option><option value="h">반기</option></select></div>'
      + '<div style="flex:1;min-width:120px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">기간</label>'
      + '<select id="np-sub" onchange="updatePeriodLabel()" style="height:34px;font-size:13px;width:100%">'
      + '<option value="1">1분기 (1~3월)</option><option value="2">2분기 (4~6월)</option><option value="3">3분기 (7~9월)</option><option value="4">4분기 (10~12월)</option></select></div>'
      + '<div style="flex:1;min-width:100px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">활성화</label>'
      + '<select id="np-active" style="height:34px;font-size:13px;width:100%"><option value="1">즉시 활성화</option><option value="0">비활성으로 추가</option></select></div>'
      + '<div style="flex:2;min-width:180px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">등급 정책 *</label>'
      + '<select id="np-policy" style="height:34px;font-size:13px;width:100%">'
      + '<option value="">— 선택 —</option>'
      + (gradePolicies.map(function(p){ return '<option value="' + p.id + '">' + escapeHtml(p.name) + ' (' + (p.criteria||[]).length + '개 등급)</option>'; }).join(''))
      + '</select></div>'
      + '<button class="btn btn-primary" style="height:34px;white-space:nowrap" onclick="addEvalPeriod()">+ 추가</button>'
      + '</div>'
      + '<div style="margin-top:8px;font-size:12px;color:var(--muted)">생성될 기간: <strong id="np-preview"></strong></div>'
      + '</div>'
      + (!periods.length ? '<div class="alert alert-orange">선택 범위에 평가 기간이 없습니다.</div>' : '');
    el.appendChild(addCard);

    // 기간 카드들 (접힌 상태)
    periods.forEach(function(period) {
      const pCard = document.createElement('div');
      pCard.className = 'period-card';
      pCard.style.marginBottom = '8px';

      const hdr = document.createElement('div');
      hdr.className = 'period-card-header';
      hdr.onclick = function() { togglePeriodCard(period.id); };
      hdr.innerHTML = '<span class="toggle-icon" id="periodToggle_' + period.id + '">▶</span>'
        + '<strong style="font-size:14px">' + period.period_label + '</strong>'
        + '<span class="bd ' + (period.period_type==='q'?'bd-q':'bd-h') + '" style="font-size:11px">' + (period.period_type==='q'?'분기':'반기') + '</span>'
        + '<span class="bd ' + (period.is_active?'bd-approved':'bd-rejected') + '" style="font-size:11px">' + (period.is_active?'활성':'비활성') + '</span>'
        + (period.locked ? '<span class="bd bd-locked" style="font-size:11px">🔒 잠김</span>' : '')
        + '<span id="period-evalmode-badge-' + period.id + '" style="color:var(--muted);font-size:12px">' + (period.eval_mode || 'MBO') + '</span>';
      pCard.appendChild(hdr);

      const body = document.createElement('div');
      body.className = 'period-card-body';
      body.id = 'periodBody_' + period.id;
      body.style.display = 'none';
      body.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px">'
        + '<div style="display:flex;align-items:center;gap:10px">'
        + '<span style="font-size:15px;font-weight:600">' + period.period_label + '</span>'
        + '<span class="bd ' + (period.period_type==='q'?'bd-q':'bd-h') + '">' + (period.period_type==='q'?'분기':'반기') + '</span>'
        + '<span class="bd ' + (period.is_active?'bd-approved':'bd-rejected') + '">' + (period.is_active?'활성':'비활성') + '</span>'
        + (period.locked ? '<span class="bd bd-locked" style="font-size:11px">🔒 잠김</span>' : '')
        + '</div>'
        + '<div style="display:flex;gap:4px">'
        + '<button class="btn btn-ghost btn-sm" onclick="togglePeriod(' + period.id + ')">' + (period.is_active?'비활성화':'활성화') + '</button>'
        + (App.isMaster() ? '<button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;padding:4px 8px;font-size:11px" onclick="deletePeriod(' + period.id + ')">삭제</button>' : '')
        + '</div></div>'
        + '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--o100)">'
        + '<div style="font-size:13px;font-weight:600;color:var(--o800);margin-bottom:10px">📊 평가방식 설정'
        + (period.locked ? '<span class="bd bd-locked" style="font-size:11px;margin-left:6px">🔒 잠김</span>' : '')
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'
        + '<span style="font-size:12px;color:var(--muted);min-width:80px">전사 기본</span>'
        + '<div style="display:flex;gap:6px">'
        + ['MBO','OKR','KPI'].map(function(m) {
            return '<button class="btn btn-sm ' + ((period.eval_mode||'MBO')===m?'btn-primary':'btn-ghost') + '"'
              + (period.locked?' disabled':'')
              + ' onclick="setPeriodEvalMode(' + period.id + ',\'' + m + '\',this)"'
              + ' style="font-size:12px;padding:3px 10px">' + m + '</button>';
          }).join('')
        + '</div>'
        + (period.locked
            ? '<span style="font-size:11px;color:var(--muted)">잠금 상태</span>'
            : '<button class="btn btn-sm" style="font-size:11px;border:1px solid var(--o300);color:var(--o600)" onclick="lockPeriodMode(' + period.id + ')">🔒 방식 잠금</button>')
        + '</div>'
        + '<div id="org-modes-' + period.id + '"><div style="font-size:12px;color:var(--muted)">조직별 설정 로딩 중...</div></div>'
        + '</div>';
      pCard.appendChild(body);
      el.appendChild(pCard);
      loadOrgModes(period.id, period.locked);
    });

    updatePeriodLabel();
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

function reloadEvalPeriods() {
  const from = parseInt(document.getElementById('periodYearFrom')?.value) || new Date().getFullYear() - 1;
  const to   = parseInt(document.getElementById('periodYearTo')?.value)   || new Date().getFullYear();
  if (to - from > 9) { showAlert('최대 10년 범위까지 조회 가능합니다.', 'orange'); return; }
  if (to < from)     { showAlert('종료 연도는 시작 연도보다 같거나 커야 합니다.', 'orange'); return; }
  renderAdmPeriods(from, to);
}

function togglePeriodCard(periodId) {
  const body = document.getElementById('periodBody_' + periodId);
  const icon = document.getElementById('periodToggle_' + periodId);
  if (!body || !icon) return;
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  icon.textContent = hidden ? '▼' : '▶';
}

function toggleAllPeriods(action) {
  document.querySelectorAll('.period-card-body').forEach(function(b) { b.style.display = action === 'expand' ? '' : 'none'; });
  document.querySelectorAll('#adm-periods .toggle-icon').forEach(function(i) { i.textContent = action === 'expand' ? '▼' : '▶'; });
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
  const year     = document.getElementById('np-year')?.value   || '2025년';
  const type     = document.getElementById('np-type')?.value   || 'q';
  const sub      = document.getElementById('np-sub')?.value    || '1';
  const active   = document.getElementById('np-active')?.value || '0';
  const policyId = document.getElementById('np-policy')?.value || '';
  const label    = type === 'q'
    ? `${year} ${sub}분기`
    : `${year} ${sub==='1'?'상':'하'}반기`;

  if (!policyId) {
    showAlert('등급 정책을 선택해 주세요. 활성화하려면 등급 정책 바인딩이 필수입니다.', 'orange');
    return;
  }

  try {
    await API.post('/eval-periods', {
      period_type: type,
      period_label: label,
      eval_year: year,
      is_active: parseInt(active),
      grade_policy_id: parseInt(policyId),
    });
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

async function loadOrgModes(periodId, periodLocked) {
  const container = document.getElementById(`org-modes-${periodId}`);
  if (!container) return;
  try {
    const managers = await API.get(`/eval-periods/${periodId}/org-modes`);
    if (!managers.length) {
      container.innerHTML = '<div style="font-size:12px;color:var(--muted)">등록된 조직장이 없습니다.</div>';
      return;
    }
    container.innerHTML = `
      <div style="font-size:12px;font-weight:500;color:var(--muted);margin-bottom:6px">조직별 방식</div>
      ${managers.map(mgr => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;
                    border-bottom:1px solid var(--o50);flex-wrap:wrap">
          <div style="min-width:140px">
            <span style="font-size:12px;font-weight:600">${mgr.org_name}</span>
            <span style="font-size:11px;color:var(--muted);margin-left:4px">
              리더: ${mgr.leader_name||'미지정'}
            </span>
          </div>
          <div style="display:flex;gap:4px">
            ${['MBO','OKR','KPI'].map(m => `
              <button class="btn btn-sm ${mgr.eval_mode===m?'btn-primary':'btn-ghost'}"
                ${periodLocked||mgr.org_locked?'disabled':''}
                onclick="setOrgEvalMode(${periodId},${mgr.leader_id},'${m}',this)"
                style="font-size:11px;padding:2px 8px">${m}</button>
            `).join('')}
          </div>
          ${mgr.org_locked
            ? '<span class="bd bd-locked" style="font-size:10px">🔒</span>'
            : ''}
        </div>`).join('')}`;
  } catch(e) {
    container.innerHTML = `<div style="font-size:12px;color:var(--red)">로딩 실패: ${e.message}</div>`;
  }
}

async function setPeriodEvalMode(periodId, mode, btn) {
  try {
    const r = await API.post(`/eval-periods/${periodId}/eval-mode`, { eval_mode: mode });
    if (r.warning) showAlert(r.warning, 'orange');
    else showAlert(`전사 기본 평가방식이 ${mode}로 변경되었습니다.`, 'green');
    const siblings = btn.parentElement.querySelectorAll('button');
    siblings.forEach(b => { b.className = b.className.replace('btn-primary','btn-ghost'); });
    btn.className = btn.className.replace('btn-ghost','btn-primary');
    const badge = document.getElementById('period-evalmode-badge-' + periodId);
    if (badge) badge.textContent = mode;
  } catch(e) { showAlert(e.message, 'red'); }
}

async function setOrgEvalMode(periodId, managerId, mode, btn) {
  try {
    await API.post(`/eval-periods/${periodId}/org-modes`, { manager_id: managerId, eval_mode: mode });
    showAlert(`평가방식이 ${mode}로 변경되었습니다.`, 'green');
    const siblings = btn.parentElement.querySelectorAll('button');
    siblings.forEach(b => { b.className = b.className.replace('btn-primary','btn-ghost'); });
    btn.className = btn.className.replace('btn-ghost','btn-primary');
  } catch(e) { showAlert(e.message, 'red'); }
}

async function lockPeriodMode(periodId) {
  if (!confirm('평가방식을 잠그면 더 이상 변경할 수 없습니다. (master만 강제 변경 가능)\n계속하시겠습니까?')) return;
  try {
    await API.post(`/eval-periods/${periodId}/lock`, {});
    showAlert('평가방식이 잠겼습니다.', 'green');
    renderAdmPeriods();
  } catch(e) { showAlert(e.message, 'red'); }
}

/* ── 미바인딩 알림 배너 ── */
async function checkMissingPolicyBanner() {
  if (!App.user || !['master', 'admin'].includes(App.user.role)) return;
  try {
    const result = await API.get('/eval-periods/missing-policy');
    const existing = document.getElementById('missing-policy-banner');

    if (result.count > 0) {
      if (existing) existing.remove();
      const banner = document.createElement('div');
      banner.id = 'missing-policy-banner';
      banner.className = 'missing-policy-banner';
      banner.innerHTML = `
        <div class="banner-content">
          <span class="banner-icon">⚠️</span>
          <span class="banner-text">
            등급의 100점환산 기준이 저장되지 않은 평가 기간이 <strong>${result.count}개</strong> 있습니다. 적용해 주세요.
          </span>
          <button class="btn btn-sm btn-primary" onclick="goToEvalPeriods()">즉시 해결 →</button>
        </div>`;
      const header = document.querySelector('.header') || document.body.firstElementChild;
      if (header && header.parentNode) {
        header.parentNode.insertBefore(banner, header.nextSibling);
      } else {
        document.body.insertBefore(banner, document.body.firstChild);
      }
    } else if (existing) {
      existing.remove();
    }
  } catch(e) {
    console.warn('Missing policy check failed:', e);
  }
}

function goToEvalPeriods() {
  App.navigate('admin');
  setTimeout(() => switchAdmTab('adm-periods'), 150);
}
