Pages.myEval = async function() {
  if (!App.user) { App.renderLogin(); return; }
  const userId = App.user?.id;
  if (!userId) { App.renderLogin(); return; }
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const [evs, activePeriods, approverRes, evalMode, periodModes] = await Promise.all([
      API.get('/evals'),
      API.get('/eval-periods/active').catch(() => []),
      API.get(`/users/${userId}/approvers`).catch(() => []),
      API.get('/settings/my-eval-mode').catch(() => ({ mode: 'MBO', source: 'global' })),
      API.get('/eval-periods/my-modes').catch(() => []),
    ]);

    // 방어 코드: 배열이 아니면 오류 처리
    if (!Array.isArray(evs)) {
      area.innerHTML = '<div class="alert alert-red">평가 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.</div>';
      return;
    }
    const safeActivePeriods = Array.isArray(activePeriods) ? activePeriods : [];
    const approvers = Array.isArray(approverRes)
      ? approverRes
      : (approverRes?.approvers || []);

    const myEvs = evs.filter(e => String(e.user_id) === String(App.user.id));
    area.innerHTML = '';

    // 승인자 체인 표시
    if (approvers.length) {
      const apprInfo = document.createElement('div');
      apprInfo.className = 'alert alert-orange';
      apprInfo.style.marginBottom = '12px';
      apprInfo.innerHTML = `<strong>내 승인 체계:</strong> ${approvers.map((a,i) =>
        `${i+1}차 ${a.name}(${a.grade||''} ${a.title||''})`).join(' → ')}`;
      area.appendChild(apprInfo);
    }

    // OKR/KPI 모드 배너
    if (evalMode?.mode === 'OKR' || evalMode?.mode === 'KPI') {
      const banner = document.createElement('div');
      banner.className = 'alert alert-teal';
      banner.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px';
      banner.innerHTML = `
        <div>
          <strong>🎯 ${evalMode.mode} 평가 모드 적용 중</strong>
          <span style="font-size:12px;margin-left:6px;opacity:.8">
            (${evalMode.source==='org_period'?'조직 설정':evalMode.source==='period'?'기간 기본값':'전사 기본값'})
          </span>
        </div>`;
      area.appendChild(banner);
    }

    // 활성 기간 중 아직 시작 안 한 것 표시
    safeActivePeriods.forEach(p => {
      const ev = myEvs.find(e => e.period_label === p.period_label && e.eval_year === p.eval_year);
      if (!ev) {
        // 해당 기간의 평가방식 확인
        const safeModes = Array.isArray(periodModes) ? periodModes : [];
        const matchedMode = safeModes.find(pm =>
          pm.period_label === p.period_label && String(pm.eval_year) === String(p.eval_year)
        );
        const periodMode = matchedMode?.mode || 'MBO';
        console.log('[period card]', p.period_label, p.eval_year, periodMode,
          '| periodModes:', safeModes.map(pm => `${pm.period_label}/${pm.eval_year}=${pm.mode}`).join(', ') || '(empty)',
          '| matched:', matchedMode ? JSON.stringify(matchedMode) : 'none');

        // 버튼 분기
        const actionBtn = periodMode === 'OKR' || periodMode === 'KPI'
          ? `<button class="btn btn-primary"
               onclick="Pages.okrEval('${p.period_label}', '${p.eval_year}', '${periodMode}')">
               🎯 ${periodMode} 작성하기 →
             </button>`
          : `<button class="btn btn-primary"
               onclick="startNewEval('${p.period_type}','${p.period_label}','${p.eval_year}')">
               목표 작성 시작 →
             </button>`;

        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'border:1.5px dashed var(--o200);background:var(--o50);margin-bottom:10px';
        card.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:15px;font-weight:600">${p.period_label}</div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px">${p.period_type==='q'?'분기 평가':'반기 평가'} · 아직 목표를 작성하지 않았습니다</div>
            </div>
            ${actionBtn}
          </div>`;
        area.appendChild(card);
      }
    });

    // 기존 eval 목록 표시
    if (myEvs.length) {
      const header = document.createElement('div');
      header.style.cssText = 'font-size:13px;font-weight:500;color:var(--muted);margin:12px 0 8px';
      header.textContent = myEvs.length > 1 ? '진행 중인 평가' : '';
      if (myEvs.length > 1) area.appendChild(header);

      myEvs.forEach(ev => {
        const phase = ev.phase || 'draft';
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '10px';

        const phaseLabels = {
          draft:'목표 작성중', pending:'승인 대기', approved:'목표 확정',
          rejected:'반려됨', final_self:'자기평가 중',
          final_mgr_pending:'상사평가 대기',
          final_mgr2_pending:'2차평가 대기',
          final_done:'평가 완료'
        };
        const phaseCls = {
          draft:'bd-draft', pending:'bd-pending', approved:'bd-approved',
          rejected:'bd-rejected', final_self:'bd-fb',
          final_mgr_pending:'bd-final',
          final_mgr2_pending:'bd-purple',
          final_done:'bd-locked'
        };

        // 헤더
        const hd = document.createElement('div');
        hd.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px';
        hd.innerHTML = `
          <div>
            <div style="font-size:15px;font-weight:600">${ev.period_label||''}
              <span class="bd" style="margin-left:6px;font-size:11px">${ev.period_type==='q'?'분기':'반기'}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${ev.eval_year||''}</div>
          </div>
          <span class="bd ${phaseCls[phase]}">${phaseLabels[phase]||phase}</span>`;
        card.appendChild(hd);

        // 플로우 바
        card.appendChild(flowBar(phase));

        // 반려 사유
        if (phase === 'rejected' && ev.reject_reason) {
          const rej = document.createElement('div');
          rej.className = 'alert alert-red';
          rej.style.marginTop = '10px';
          rej.innerHTML = `<strong>반려 사유:</strong> ${ev.reject_reason}`;
          card.appendChild(rej);
        }

        // 액션 버튼
        const abar = document.createElement('div');
        abar.className = 'abar';
        abar.style.marginTop = '12px';

        if (phase === 'draft') {
          abar.innerHTML = `
            <button class="btn btn-ghost" onclick="loadAndEditEval(${ev.id},'${ev.period_type}','${ev.period_label}','${ev.eval_year}')">목표 편집</button>
            <button class="btn btn-primary" onclick="loadAndEditEval(${ev.id},'${ev.period_type}','${ev.period_label}','${ev.eval_year}')">승인 요청 →</button>`;
        } else if (phase === 'rejected') {
          abar.innerHTML = `
            <button class="btn btn-primary" onclick="reopenEval(${ev.id},'${ev.period_type}','${ev.period_label}','${ev.eval_year}')">수정 후 재요청 →</button>`;
        } else if (phase === 'pending') {
          abar.innerHTML = `<span style="font-size:13px;color:var(--muted)">승인자 검토 중...</span>`;
        } else if (['approved','final_self','final_mgr_pending','final_mgr2_pending'].includes(phase)) {
          abar.innerHTML = `
            <button class="btn btn-ghost" onclick="App.navigate('progress')">중간 보고 →</button>
            <button class="btn btn-teal" onclick="App.navigate('feedback')">중간 피드백 →</button>
            <button class="btn btn-purple" onclick="App.navigate('final')">최종 평가 →</button>`;
        }

        card.appendChild(abar);
        area.appendChild(card);
      });
    }

    // 아무것도 없을 때
    if (!myEvs.length && !safeActivePeriods.length) {
      area.innerHTML = `<div class="card">
        <div class="alert alert-orange">
          현재 활성화된 평가 기간이 없습니다. 관리자에게 문의하세요.
        </div>
      </div>`;
    }

    // 과거 목표 승인 이력
    try {
      const visibility = await API.get('/settings/history-visibility').catch(() => ({ enabled: true }));
      if (visibility.enabled) {
        const histSection = document.createElement('div');
        histSection.style.cssText = 'border-top:2px solid var(--o100);padding-top:14px;margin-top:16px';
        histSection.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:14px;font-weight:600;color:var(--o800)">과거 목표승인 이력</span>
            <button class="btn btn-ghost btn-sm" onclick="toggleHistoryPanel(this)">펼치기 ▼</button>
          </div>
          <div id="history-panel" style="display:none"></div>`;
        area.appendChild(histSection);
      }
    } catch(e) {}

  } catch(err) {
    area.innerHTML = `<div class="alert alert-red">오류: ${err.message}</div>`;
  }
};

// 새 평가 시작
async function startNewEval(periodType, periodLabel, evalYear) {
  _period = periodType; _subP = '1';
  _goals = {}; _cats = App.categories;
  _currentEvalId = null;
  _currentPeriodLabel = periodLabel;
  _currentEvalYear = evalYear;
  const area = document.getElementById('main-area');
  area.innerHTML = '';
  const approverRes = await API.get(`/users/${App.user.id}/approvers`).catch(() => []);
  const approvers = Array.isArray(approverRes) ? approverRes : (approverRes?.approvers || []);
  renderGoalSetForm(null, approvers);
}

// 기존 eval 편집
async function loadAndEditEval(evalId, periodType, periodLabel, evalYear) {
  _currentEvalId = evalId;
  _currentPeriodLabel = periodLabel;
  _currentEvalYear = evalYear;
  _period = periodType; _goals = {}; _cats = App.categories;
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  const approverRes = await API.get(`/users/${App.user.id}/approvers`).catch(() => []);
  const approvers = Array.isArray(approverRes) ? approverRes : (approverRes?.approvers || []);
  try {
    const goals = await API.get(`/evals/${evalId}/goals`);
    goals.forEach(g => {
      if (!_goals[g.category_id]) _goals[g.category_id] = [];
      _goals[g.category_id].push({ name: g.name, kpi: g.kpi, weight: g.weight });
    });
  } catch(e) {}
  area.innerHTML = '';
  renderGoalSetForm({ id: evalId, period_type: periodType, period_label: periodLabel, eval_year: evalYear }, approvers);
}

// 반려 후 재편집
async function reopenEval(evalId, periodType, periodLabel, evalYear) {
  try { await API.patch('/evals/' + evalId + '/reopen', {}); } catch(e) {}
  await loadAndEditEval(evalId, periodType, periodLabel, evalYear);
}

let _period = 'q', _subP = '1', _cats = [], _goals = {};
let _currentEvalId = null;

function renderGoalSetForm(ev, approvers) {
  const area = document.getElementById('main-area');
  _period = ev?.period_type || 'q';
  _subP   = '1';
  _cats   = App.categories;
  _goals  = {};
  if (ev?.id) { /* goals loaded below */ }

  const apprHtml = approvers.length
    ? `<div class="alert alert-orange">승인 체계: ${approvers.map((a,i)=>`${i+1}차 ${a.name}(${a.title})`).join(' → ')}</div>`
    : `<div class="alert alert-red">조직도에 상위 승인자가 없습니다. 인사팀에 문의하세요.</div>`;

  const card = html(`<div class="card">
    <div class="card-header"><div><div class="card-header-t">목표 설정</div><div class="card-header-s">카테고리별 목표를 입력하고 승인을 요청하세요</div></div></div>
    <div class="form-row">
      <div class="form-group"><label>사원명</label><input value="${App.user.name}" disabled style="background:var(--o50)"></div>
      <div class="form-group"><label>부서</label><input value="${App.user.dept||''}" disabled style="background:var(--o50)"></div>
      <div class="form-group"><label>평가 연도</label><select id="ev-year"><option>2025년</option><option>2026년</option></select></div>
    </div>
    ${apprHtml}
    <label class="form-group" style="margin-bottom:6px"><span style="font-size:12px;color:var(--o600);font-weight:500">평가 주기</span></label>
    <div class="period-pick">
      <div class="popt${_period==='q'?' sel':''}" id="po-q"><div class="pt">분기 평가</div><div class="ps">연 4회</div></div>
      <div class="popt${_period==='h'?' sel':''}" id="po-h"><div class="pt">반기 평가</div><div class="ps">연 2회</div></div>
    </div>
    <div class="sub-periods" id="subPeriods"></div>
  </div>`);
  area.appendChild(card);
  document.getElementById('po-q').onclick = () => { _period='q';_subP='1'; document.querySelectorAll('.popt').forEach(x=>x.classList.remove('sel')); document.getElementById('po-q').classList.add('sel'); renderSubP(); };
  document.getElementById('po-h').onclick = () => { _period='h';_subP='1'; document.querySelectorAll('.popt').forEach(x=>x.classList.remove('sel')); document.getElementById('po-h').classList.add('sel'); renderSubP(); };
  renderSubP();

  // Category goal blocks
  const catArea = document.createElement('div');
  catArea.id = 'cat-area';
  area.appendChild(catArea);
  _cats.forEach(cat => renderCatBlock(cat, catArea));

  // Self reason
  const reason = html(`<div class="card">
    <span style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:8px">목표 설정 배경 및 의견</span>
    <textarea id="ev-reason" placeholder="목표 설정 이유와 기대 성과를 작성하세요..." style="width:100%;min-height:100px;resize:vertical">${ev?.self_reason||''}</textarea>
  </div>`);
  area.appendChild(reason);

  const abar = html(`<div class="abar">
    <button class="btn btn-ghost" onclick="saveDraftGoals()">임시저장</button>
    <button class="btn btn-primary" onclick="submitGoals()">승인 요청 →</button>
  </div>`);
  area.appendChild(abar);

  // Load existing goals
  if (ev?.id) {
    API.get(`/evals/${ev.id}/goals`).then(goals => {
      goals.forEach(g => {
        if (!_goals[g.category_id]) _goals[g.category_id] = [];
        _goals[g.category_id].push({ name:g.name, kpi:g.kpi, weight:g.weight, category_id:g.category_id });
      });
      _cats.forEach(cat => renderCatBlock(cat, catArea));
    });
  }
}

function renderSubP() {
  const el = document.getElementById('subPeriods'); if (!el) return;
  el.innerHTML = subPeriodHtml(_period, _subP);
  el.querySelectorAll('.spopt').forEach(s => s.onclick = () => {
    _subP = s.dataset.v;
    el.querySelectorAll('.spopt').forEach(x=>x.classList.remove('sel'));
    s.classList.add('sel');
  });
}

function renderCatBlock(cat, container) {
  const existing = document.getElementById('cat-'+cat.id);
  if (!_goals[cat.id]) _goals[cat.id] = [];
  const goals = _goals[cat.id];
  const tw = goals.reduce((a,g)=>a+Number(g.weight),0);
  const wtCls = tw===100?'wt-ok':tw>100?'wt-err':'wt-warn';

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
    <div id="gl-${cat.id}">${goals.map((g,i)=>goalRowHtml(cat.id,i,g)).join('')}</div>`;

  if (existing) {
    // 기존 블록을 같은 위치에서 교체 (순서 유지)
    container.replaceChild(block, existing);
  } else {
    // 최초 렌더 시 인사팀이 설정한 sort_order 순서대로 삽입
    const catOrder = _cats.map(c => String(c.id));
    const myIdx = catOrder.indexOf(String(cat.id));
    // 내 앞에 있어야 할 카테고리 블록 중 마지막으로 존재하는 것 찾기
    let insertBefore = null;
    for (let i = myIdx + 1; i < catOrder.length; i++) {
      const nextEl = document.getElementById('cat-' + catOrder[i]);
      if (nextEl) { insertBefore = nextEl; break; }
    }
    if (insertBefore) container.insertBefore(block, insertBefore);
    else container.appendChild(block);
  }
}

function goalRowHtml(catId, idx, g) {
  return `<div class="goal-row" id="gr-${catId}-${idx}">
    <div class="goal-num">${idx+1}</div>
    <div class="goal-inputs">
      <input class="goal-name" placeholder="목표명 입력" value="${g.name||''}" onchange="updGoal('${catId}',${idx},'name',this.value)">
      <div class="goal-meta">
        <span style="font-size:12px;color:var(--muted)">가중치</span>
        <input type="number" min="1" max="100" value="${g.weight||10}" onchange="updGoal('${catId}',${idx},'weight',this.value)">
        <span style="font-size:12px;color:var(--muted)">%&nbsp;&nbsp;KPI</span>
        <input type="text" placeholder="측정 지표" value="${g.kpi||''}" onchange="updGoal('${catId}',${idx},'kpi',this.value)">
      </div>
    </div>
    <button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;padding:3px 8px;font-size:11px" onclick="delGoalRow('${catId}',${idx})">삭제</button>
  </div>`;
}

function addGoalRow(catId) {
  if (!_goals[catId]) _goals[catId] = [];
  if (_goals[catId].length >= 5) { showAlert('카테고리당 최대 5개까지 추가 가능합니다.','orange'); return; }
  _goals[catId].push({ name:'', kpi:'', weight:10, category_id:catId });
  const cat = App.categories.find(c=>String(c.id)===String(catId));
  renderCatBlock(cat, document.getElementById('cat-area'));
}

function delGoalRow(catId, idx) {
  _goals[catId].splice(idx, 1);
  const cat = App.categories.find(c=>String(c.id)===String(catId));
  renderCatBlock(cat, document.getElementById('cat-area'));
}

// DOM에서 현재 입력값을 _goals 메모리에 강제 동기화
// onchange가 발동 안 된 경우(클릭 즉시 저장 등)를 대비
function collectGoalsFromDOM() {
  _cats.forEach(cat => {
    const gl = document.getElementById('gl-' + cat.id);
    if (!gl) return;
    const rows = gl.querySelectorAll('.goal-row');
    rows.forEach((row, idx) => {
      if (!_goals[cat.id] || !_goals[cat.id][idx]) return;
      const nameEl   = row.querySelector('.goal-name');
      const weightEl = row.querySelector('input[type=number]');
      const kpiEl    = row.querySelector('input[type=text]');
      if (nameEl)   _goals[cat.id][idx].name   = nameEl.value;
      if (weightEl) _goals[cat.id][idx].weight  = Math.max(0, Math.min(100, parseInt(weightEl.value) || 0));
      if (kpiEl)    _goals[cat.id][idx].kpi     = kpiEl.value;
    });
  });
}

function updGoal(catId, idx, field, val) {
  if (!_goals[catId]) return;
  _goals[catId][idx][field] = field==='weight' ? Math.max(0,Math.min(100,parseInt(val)||0)) : val;
  if (field==='weight') {
    const tw = _goals[catId].reduce((a,g)=>a+Number(g.weight),0);
    const wEl = document.getElementById('wt-'+catId);
    if (wEl) { wEl.textContent=`합계 ${tw}%`; wEl.className=tw===100?'wt-ok':tw>100?'wt-err':'wt-warn'; }
  }
}

async function saveOrCreateEval() {
  // _currentEvalId가 있으면 재사용 (편집 중인 eval)
  if (_currentEvalId) return { id: _currentEvalId };

  const period = (_period === 'q' || _period === 'h') ? _period : 'q';
  const subP   = (['1','2','3','4'].includes(String(_subP))) ? String(_subP) : '1';
  const year   = _currentEvalYear || '2025년';
  const label  = _currentPeriodLabel || getPeriodLabel(period, subP, year) || year + ' 1분기';

  const data = await API.post('/evals', {
    period_type:  period,
    period_label: label,
    eval_year:    year,
  });
  _currentEvalId = data.id;
  return { id: data.id };
}

async function saveDraftGoals() {
  try {
    // DOM에서 최신 입력값 먼저 수집 (onchange 미발생 케이스 대비)
    collectGoalsFromDOM();
    const ev = await saveOrCreateEval();
    if (!ev || !ev.id) { showAlert('평가 정보를 불러올 수 없습니다.', 'red'); return; }
    const goals = Object.entries(_goals).flatMap(([catId, gs]) =>
      gs.map(g => ({
        category_id: catId,
        name:        g.name   || '',
        kpi:         g.kpi    || '',
        weight:      Number(g.weight) || 0,
      }))
    );
    const reasonEl = document.getElementById('ev-reason');
    const reason   = reasonEl ? reasonEl.value : '';
    await API.post(`/evals/${ev.id}/goals`, { goals, self_reason: reason });
    showAlert('임시저장 완료!', 'green');
  } catch(e) {
    console.error('[saveDraftGoals]', e);
    showAlert('임시저장 실패: ' + e.message, 'red');
  }
}

async function submitGoals() {
  // DOM에서 최신 입력값 먼저 수집
  collectGoalsFromDOM();

  const allGoals = Object.values(_goals).flat();
  const hasGoals = allGoals.some(g => g.name && g.name.trim());
  if (!hasGoals) { showAlert('최소 1개 이상의 목표를 입력하세요.', 'orange'); return; }

  for (const cat of App.categories) {
    const cg = (_goals[cat.id] || []).filter(g => g.name && g.name.trim());
    if (cg.length > 0) {
      const tw = cg.reduce((a, g) => a + Number(g.weight), 0);
      if (tw !== 100) {
        showAlert(`[${cat.name}] 가중치 합이 100%여야 합니다. 현재: ${tw}%`, 'orange');
        return;
      }
    }
  }

  try {
    const ev = await saveOrCreateEval();
    if (!ev || !ev.id) { showAlert('평가 정보를 불러올 수 없습니다.', 'red'); return; }
    const goals = Object.entries(_goals).flatMap(([catId, gs]) =>
      gs.filter(g => g.name && g.name.trim()).map(g => ({
        category_id: catId,
        name:        g.name  || '',
        kpi:         g.kpi   || '',
        weight:      Number(g.weight) || 0,
      }))
    );
    const reasonEl = document.getElementById('ev-reason');
    const reason   = reasonEl ? reasonEl.value : '';
    await API.post(`/evals/${ev.id}/goals`,  { goals, self_reason: reason });
    await API.post(`/evals/${ev.id}/submit`, { self_reason: reason });
    showAlert('승인 요청이 전송되었습니다!', 'teal');
    setTimeout(() => App.navigate('my-eval'), 800);
  } catch(e) {
    console.error('[submitGoals]', e);
    showAlert('오류: ' + e.message, 'red');
  }
}



function renderRejectedView(ev, approvers) {
  const area = document.getElementById('main-area');

  // 반려 알림 카드
  const alertCard = document.createElement('div');
  alertCard.className = 'card';
  alertCard.innerHTML = `
    <div class="card-header" style="background:#A32D2D">
      <div>
        <div class="card-header-t">목표 반려됨 — 수정 후 재제출 필요</div>
        <div class="card-header-s">${ev.period_label || ''}</div>
      </div>
    </div>
    <div class="alert alert-red" style="margin-bottom:12px">
      목표가 반려되었습니다. 아래 반려 사유를 확인하고 목표를 수정한 후 다시 승인 요청하세요.
    </div>
    ${ev.reject_reason ? `
      <div style="background:#FFF4EC;border:1px solid #FFBF80;border-radius:8px;padding:12px;margin-bottom:4px">
        <div style="font-size:12px;color:#B84D08;font-weight:500;margin-bottom:4px">반려 사유</div>
        <div style="font-size:14px;color:#4A1800">${ev.reject_reason}</div>
      </div>` : ''}
    <div class="abar">
      <button class="btn btn-primary" onclick="startResubmit(${ev.id})">목표 수정하기 →</button>
    </div>`;
  area.appendChild(alertCard);
}

async function startResubmit(evalId) {
  // 반려된 eval을 draft로 되돌리고 수정 폼 표시
  try {
    await API.patch('/evals/' + evalId + '/reopen', {});
  } catch(e) { /* 이미 draft면 무시 */ }
  App.navigate('my-eval');
}

function renderPendingView(ev, approvers) {
  const area = document.getElementById('main-area');
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-header"><div><div class="card-header-t">목표 승인 대기 중</div><div class="card-header-s">${ev.period_label}</div></div></div>
    <div class="alert alert-orange">승인자의 검토를 기다리고 있습니다.</div>
    ${approvers.map((a,i)=>`<div class="user-row">
      <div class="avatar" style="background:var(--o100);color:var(--o800)">${a.name.slice(0,2)}</div>
      <div style="flex:1"><div style="font-weight:500">${a.name} (${a.title})</div><div style="font-size:12px;color:var(--muted)">${i+1}차 승인자</div></div>
    </div>`).join('')}
    <div class="abar"><button class="btn btn-ghost btn-sm" onclick="cancelApproval(${ev.id})">요청 취소</button></div>`;
  area.appendChild(card);
  API.get(`/evals/${ev.id}/goals`).then(goals => {
    const sum = document.createElement('div');
    sum.className = 'card';
    sum.innerHTML = '<div style="font-size:13px;font-weight:500;margin-bottom:10px;color:var(--muted)">제출된 목표</div>' + renderGoalsSummary(goals, App.categories);
    area.appendChild(sum);
  });
}

async function cancelApproval(evalId) {
  if (!confirm('승인 요청을 취소하시겠습니까?')) return;
  try {
    // phase를 draft로 되돌리기 — 서버에서 직접 처리하므로 재제출 방식으로 우회
    showAlert('취소 후 다시 작성해 주세요. (새로고침)','orange');
    setTimeout(() => App.navigate('my-eval'), 1000);
  } catch(e) { showAlert(e.message,'red'); }
}

function renderApprovedView(ev) {
  const area = document.getElementById('main-area');
  const phaseLabels = {
    approved:'목표 확정 — 실행 중',
    final_self:'자기 최종평가 진행 중',
    final_mgr_pending:'상사 최종평가 대기',
    final_done:'평가 완료'
  };
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-header"><div><div class="card-header-t">${phaseLabels[ev.phase]||ev.phase}</div><div class="card-header-s">${ev.period_label}</div></div></div>
    <div class="alert alert-green">목표가 확정되었습니다. 중간 피드백과 최종 평가를 진행하세요.</div>
    <div class="abar">
      <button class="btn btn-teal" onclick="App.navigate('feedback')">중간 피드백 →</button>
      ${ev.phase==='approved'?`<button class="btn btn-purple" onclick="App.navigate('final')">최종 평가 시작 →</button>`:''}
    </div>`;
  area.appendChild(card);

  if (ev.phase === 'final_done') {
    API.get(`/final/${ev.id}`).then(fe => {
      if (!fe) return;
      const scores = {};
      (fe.scores||[]).forEach(s => scores[s.goal_id] = s);
      API.get(`/evals/${ev.id}/goals`).then(goals => {
        const totalW = goals.reduce((a,g)=>a+g.weight,0)||1;
        const sc = goals.reduce((a,g)=>a+((scores[g.id]?.mgr_score||0)/5*100)*(g.weight/totalW),0);
        const finalScore = Math.round(sc*10)/10;
        const grade = finalScore>=90?'S':finalScore>=80?'A':finalScore>=70?'B':finalScore>=60?'C':'D';
        const res = document.createElement('div');
        res.className = 'card';
        res.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <div style="font-size:15px;font-weight:600">최종 평가 결과</div>
            <div><span style="font-size:28px;font-weight:700;color:var(--o500)">${finalScore}점</span> ${gradeEl(grade)}</div>
          </div>
          <div class="alert" style="background:#F1EFE8;color:#2C2C2A;border-color:#B4B2A9;font-size:12px">최종 평가는 잠금 처리되어 인사팀만 수정 가능합니다.</div>
          ${goals.map(g=>{
            const ms=(scores[g.id]?.mgr_score||0)/5*100;
            return `<div class="bar-row"><div class="bar-label"><span>${g.name}</span><span style="font-weight:500;color:var(--o800)">${scoreLabel(scores[g.id]?.mgr_score)} (${Math.round(ms)}%)</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(ms)}%"></div></div></div>`;
          }).join('')}
          ${fe.mgr_note?`<div class="alert alert-purple" style="margin-top:12px;font-size:13px">상사 의견: ${fe.mgr_note}</div>`:''}`;
        area.appendChild(res);
      });
    });
  }
}

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
      final_mgr_pending:'상사평가대기', final_mgr2_pending:'2차평가대기', final_done:'평가완료'
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
        ${(ev.goals||[]).length ? `<div style="margin-bottom:8px">
          ${(ev.goals||[]).map(g => `
            <div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;border-bottom:1px solid var(--o50)">
              <span style="flex:1;font-weight:500">${g.name||''}</span>
              <span style="background:var(--o100);color:var(--o800);padding:1px 6px;border-radius:8px;font-size:11px">${g.weight}%</span>
            </div>`).join('')}
        </div>` : ''}
        ${(ev.approvals||[]).length ? `<div style="border-top:1px solid var(--o100);padding-top:8px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:5px">승인 이력</div>
          ${(ev.approvals||[]).map(a => `
            <div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0">
              <span class="bd ${a.action==='approved'?'bd-approved':'bd-rejected'}" style="font-size:10px">${a.action==='approved'?'승인':'반려'}</span>
              <span style="font-weight:500">${a.approver_name||''}</span>
              <span style="color:var(--muted)">${(a.created_at||'').slice(0,10)}</span>
              ${a.note?`<span style="color:var(--muted)">— ${a.note}</span>`:''}
            </div>`).join('')}
        </div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    panel.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}