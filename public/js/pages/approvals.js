Pages.approvals = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const pending = await API.get('/approvals/pending');
    area.innerHTML = '';

    // 탭 구성
    const tabsEl = document.createElement('div');
    tabsEl.className = 'stabs';
    tabsEl.innerHTML = `
      <button class="stb active" id="stb-appr-pending" onclick="switchApprTab('appr-pending')">
        승인 대기 ${pending.length ? `<span class="cnt">${pending.length}</span>` : ''}
      </button>
      <button class="stb" id="stb-appr-hist" onclick="switchApprTab('appr-hist')">목표 승인 이력</button>`;
    area.appendChild(tabsEl);

    const pendingEl = document.createElement('div');
    pendingEl.className = 'sp active';
    pendingEl.id = 'appr-pending';
    area.appendChild(pendingEl);

    const histEl = document.createElement('div');
    histEl.className = 'sp';
    histEl.id = 'appr-hist';
    area.appendChild(histEl);

    // 승인 대기 렌더
    await renderPendingApprovals(pending, pendingEl);
  } catch(e) {
    area.innerHTML = `<div class="alert alert-red">${e.message}</div>`;
  }
};

function switchApprTab(id) {
  document.querySelectorAll('.stb').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sp').forEach(s => s.classList.remove('active'));
  document.getElementById('stb-'+id)?.classList.add('active');
  document.getElementById(id)?.classList.add('active');
  if (id === 'appr-hist') renderMyApprovalHistory();
}

async function renderPendingApprovals(pending, el) {
  if (!el) return;
  if (!pending.length) {
    el.innerHTML = '<div class="card"><div class="alert alert-orange">승인 대기 중인 목표가 없습니다.</div></div>';
    return;
  }
  el.innerHTML = '';
  for (const ev of pending) {
    const [goals, history] = await Promise.all([
      API.get(`/evals/${ev.id}/goals`),
      API.get(`/approvals/${ev.id}/history`),
    ]);
    const approverRes = await API.get(`/users/${ev.user_id}/approvers`).catch(() => []);
    const approvers = Array.isArray(approverRes) ? approverRes : (approverRes?.approvers || []);
    const myLevel = approvers.findIndex(a => String(a.id) === String(App.user.id)) + 1;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-header-t">${ev.user_name} — ${ev.period_label}</div>
          <div class="card-header-s">${ev.dept||''} · ${myLevel}차 승인 요청</div>
        </div>
        <span class="bd bd-pending">${myLevel}차 승인 대기</span>
      </div>
      ${ev.self_reason ? `<div class="alert alert-orange" style="font-size:12px">직원 의견: ${ev.self_reason}</div>` : ''}
      ${renderGoalsSummary(goals, App.categories)}
      ${history.length ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">이전 승인 이력</div>
        ${history.map(h=>`<div class="user-row" style="padding:6px 0">
          <div class="avatar" style="width:26px;height:26px;font-size:10px;background:var(--green-bg);color:var(--green)">${h.approver_name.slice(0,2)}</div>
          <div style="flex:1;font-size:12px">${h.approver_name} (${h.level}차) <span class="bd bd-approved">승인</span></div>
          <div style="font-size:11px;color:var(--muted)">${h.created_at?.slice(0,10)||''}</div>
        </div>`).join('')}
      </div>` : ''}
      <div style="margin-top:12px">
        <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">승인 의견 (반려 시 필수)</label>
        <textarea id="appr-note-${ev.id}" placeholder="의견 또는 반려 사유를 입력하세요..." style="width:100%;min-height:72px;resize:vertical"></textarea>
      </div>
      <div class="abar">
        <button class="btn btn-danger" onclick="rejectGoal(${ev.id})">반려</button>
        <button class="btn btn-success" onclick="approveGoal(${ev.id})">승인</button>
      </div>`;
    el.appendChild(card);
  }
}

/* ── 내 승인 이력 ── */
let _apprHistFilter = { label: '', year: '' };

async function renderMyApprovalHistory() {
  const el = document.getElementById('appr-hist');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const [periods, setting] = await Promise.all([
      API.get('/eval-periods').catch(() => []),
      API.get('/settings/approval-edit').catch(() => ({ enabled: false })),
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
            ${Array.isArray(periods) ? sortPeriodsDesc(periods).map(p =>
              `<option value="${p.period_label}|${p.eval_year}"
                ${_apprHistFilter.label===p.period_label?'selected':''}>${p.period_label}</option>`
            ).join('') : ''}
          </select>
        </div>
        <button class="btn btn-primary" style="height:34px" onclick="applyApprHistFilter()">조회</button>
        ${_apprHistFilter.label ? `<button class="btn btn-ghost" style="height:34px"
          onclick="_apprHistFilter={label:'',year:''};renderMyApprovalHistory()">초기화</button>` : ''}
      </div>
      ${!canEdit ? `<div class="alert alert-orange" style="font-size:12px;margin-top:10px">
        현재 승인 수정/취소가 비활성화 상태입니다. <strong>평가 정책</strong> 탭에서 활성화할 수 있습니다.
      </div>` : ''}`;
    el.appendChild(filterDiv);

    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-orange';
      empty.textContent = '해당 기간에 승인 이력이 없습니다.';
      el.appendChild(empty);
      return;
    }

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
              <span style="font-size:12px;color:var(--muted);font-weight:400"> · ${h.target_dept||''} ${h.target_grade||''} ${h.target_title||''}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">
              ${h.period_label||''} · ${h.level}차 ${actionLabels[h.action]||h.action} · ${(h.created_at||'').slice(0,16).replace('T',' ')}
            </div>
          </div>
          <span class="bd ${actionCls[h.action]||'bd-draft'}">${h.level}차 ${actionLabels[h.action]||h.action}</span>
        </div>
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
          <button class="btn btn-ghost btn-sm" onclick="editApproval(${h.id})">의견 수정</button>
        </div>` : ''}
        <!-- 승인한 목표 (final_eval 유무와 무관하게 항상 표시) -->
        ${(h.goals||[]).length ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--o100)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500">승인한 목표</div>
          ${(h.goals||[]).map(g => {
            const sc  = (h.final_eval?.scores||[]).find(s=>String(s.goal_id)===String(g.id));
            const ss  = sc?.self_score        || 0;
            const ms  = sc?.mgr_score         || 0;
            const ms2 = sc?.second_mgr_score  || 0;
            return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--o50);flex-wrap:wrap">
              <span style="flex:1;font-size:12px;font-weight:500">${g.name||''}
                <span style="font-size:11px;color:var(--muted);margin-left:4px">${g.weight||0}%</span>
                ${g.kpi ? `<span style="font-size:11px;color:var(--muted);margin-left:6px">KPI: ${g.kpi}</span>` : ''}
              </span>
              ${ss  ? `<span style="font-size:12px;color:var(--muted)">자기 ${'★'.repeat(ss)}${'☆'.repeat(5-ss)} ${ss}점</span>`  : ''}
              ${ms  ? `<span style="font-size:12px;color:var(--o500)">1차 ${'★'.repeat(ms)}${'☆'.repeat(5-ms)} ${ms}점</span>`   : ''}
              ${ms2 ? `<span style="font-size:12px;color:var(--o700)">2차 ${'★'.repeat(ms2)}${'☆'.repeat(5-ms2)} ${ms2}점</span>` : ''}
            </div>`;
          }).join('')}
        </div>` : ''}

        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--o100);font-size:12px;color:var(--muted)">
          💡 최종평가 결과는 <strong>내 평가 → 상사 최종평가</strong>에서 확인하세요.
        </div>`;
      el.appendChild(card);
    });
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

function applyApprHistFilter() {
  const val = document.getElementById('aphr-period')?.value || '';
  if (val) { const [l,y] = val.split('|'); _apprHistFilter = { label:l, year:y||'' }; }
  else _apprHistFilter = { label:'', year:'' };
  renderMyApprovalHistory();
}

async function cancelApproval(approvalId, targetName, level) {
  if (!confirm(`${targetName}의 ${level}차 승인을 취소하시겠습니까?\n취소 시 해당 평가가 승인 대기로 돌아갑니다.`)) return;
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


async function approveGoal(evalId) {
  const note = document.getElementById('appr-note-'+evalId)?.value || '';
  try {
    const res = await API.post(`/approvals/${evalId}/approve`, { note });
    if (res.finalApproved) showAlert('목표가 최종 승인되었습니다!', 'green');
    else showAlert('1차 승인 완료. 다음 승인자에게 전달되었습니다.', 'teal');
    setTimeout(() => Pages.approvals(), 800);
  } catch(e) { showAlert(e.message, 'red'); }
}

async function rejectGoal(evalId) {
  const note = document.getElementById('appr-note-'+evalId)?.value?.trim();
  if (!note) { showAlert('반려 사유를 입력해주세요.', 'orange'); return; }
  try {
    await API.post(`/approvals/${evalId}/reject`, { note });
    showAlert('목표가 반려되었습니다.', 'red');
    setTimeout(() => Pages.approvals(), 800);
  } catch(e) { showAlert(e.message, 'red'); }
}
