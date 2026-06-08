/* ── 보고·피드백 통합 페이지 (PROMPT 64B) ── */
var Pages = window.Pages || {};

Pages.myReportFeedback = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';

  // UNIFY-1: 내 평가 홈에서 전달된 초기 evalId (소비 후 초기화)
  const initialEvalId = window._rfInitialEvalId || null;
  window._rfInitialEvalId = null;

  try {
    // RF-VIEW-1: 역할 모드 판정 (self / team_auto / search)
    const rfMode = await API.get('/rf/auto').catch(() => ({ mode: 'self' }));
    window._rfMode = rfMode.mode || 'self';

    const evs = await API.get('/evals');
    const myEvs = (typeof sortPeriodsDesc === 'function'
      ? sortPeriodsDesc(evs.filter(e =>
          String(e.user_id) === String(App.user.id) &&
          ['approved','final_self','final_mgr_pending','final_done'].includes(e.phase)
        ))
      : evs.filter(e =>
          String(e.user_id) === String(App.user.id) &&
          ['approved','final_self','final_mgr_pending','final_done'].includes(e.phase)
        ));

    area.innerHTML = '';

    // search 모드: 검색 패널 (RF-VIEW-2)
    if (window._rfMode === 'search') {
      await renderRFSearchPanel(area);
      return;  // search 모드는 검색 패널만 — 본인 탭 표시 없음
    }

    if (!myEvs.length) {
      const empty = document.createElement('div');
      empty.innerHTML = `<div class="card"><div class="alert alert-orange">목표가 확정된 후 보고·피드백을 확인할 수 있습니다.</div></div>`;
      area.appendChild(empty);
      return;
    }

    // UNIFY-1: 전달된 evalId로 초기 활성 기간 결정 (없으면 최신 기간)
    const initialEv = initialEvalId
      ? (myEvs.find(e => String(e.id) === String(initialEvalId)) || myEvs[0])
      : myEvs[0];

    window._rfEvs = myEvs;  // lazy 렌더링용 캐시
    if (myEvs.length > 1) {
      const tabEl = document.createElement('div');
      tabEl.className = 'stabs';
      tabEl.innerHTML = myEvs.map(ev =>
        `<button class="stb${ev.id === initialEv.id ? ' active' : ''}" id="stb-rf-${ev.id}" onclick="switchRFTab(${ev.id})">${ev.period_label}</button>`
      ).join('');
      area.appendChild(tabEl);
    }

    for (let i = 0; i < myEvs.length; i++) {
      const ev = myEvs[i];
      const sp = document.createElement('div');
      sp.id = 'rf-pane-' + ev.id;
      sp.className = ev.id === initialEv.id ? '' : 'rf-hidden';
      sp.innerHTML = '<div class="spinner">로딩 중...</div>';
      area.appendChild(sp);
    }
    // 초기 활성 pane만 즉시 렌더, 나머지는 탭 클릭 시 lazy
    renderRFPane(initialEv);
  } catch(e) {
    area.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
};

function switchRFTab(evalId) {
  document.querySelectorAll('.stb[id^="stb-rf-"]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="rf-pane-"]').forEach(p => p.classList.add('rf-hidden'));
  document.getElementById('stb-rf-' + evalId)?.classList.add('active');
  const pane = document.getElementById('rf-pane-' + evalId);
  if (pane) {
    pane.classList.remove('rf-hidden');
    // spinner가 남아있으면 lazy 렌더
    if (pane.querySelector('.spinner')) {
      const evsData = window._perfData;
      const ev = (window._rfEvs || []).find(e => String(e.id) === String(evalId));
      if (ev) renderRFPane(ev);
    }
  }
}

async function renderRFPane(ev) {
  const el = document.getElementById('rf-pane-' + ev.id);
  if (!el) return;
  try {
    const [goals, reports, feedbacks] = await Promise.all([
      API.get(`/evals/${ev.id}/goals`),
      API.get(`/reports/${ev.id}`),
      API.get(`/feedback/${ev.id}`)
    ]);

    const legacyReports = reports.filter(r => r.goal_id === null || r.goal_id === undefined);
    const newReports    = reports.filter(r => r.goal_id !== null && r.goal_id !== undefined);
    const parsed        = parseLegacyReports(legacyReports, goals);
    const reportsByGoal = groupByGoalId([...newReports, ...parsed.byGoal]);
    const fbsByGoal     = groupFeedbacksByGoal(feedbacks, goals);

    const canReport = ['approved','final_self','final_mgr_pending'].includes(ev.phase);

    let html = `<div style="font-size:13px;color:var(--muted);margin-bottom:12px">${ev.period_label} · ${ev.eval_mode||'MBO'}`;
    if (window._rfMode === 'team_auto') html += ` <span class="bd" style="background:var(--teal,#0d7c6b);color:white;font-size:10px">팀장 자동</span>`;
    html += `</div>`;

    goals.forEach(g => {
      html += renderGoalCard(g, reportsByGoal[g.id] || [], fbsByGoal[g.id] || [], true);
    });

    html += renderSummaryCard([...parsed.summary], reports.filter(r => r.goal_id === null && !legacyReports.find(lr=>lr.id===r.id)).concat([]), feedbacks);

    if (canReport) html += renderWriteForm(ev, goals);

    el.innerHTML = html;

    // RF-VIEW-1: team_auto 모드 — 팀원 섹션 추가
    if (window._rfMode === 'team_auto') {
      renderRFTeamSection(el, ev.period_label);
    }
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

/* ── RF-VIEW-1: 팀원 섹션 렌더 (team_auto 모드) ── */
async function renderRFTeamSection(el, periodLabel) {
  const teamDiv = document.createElement('div');
  teamDiv.id = 'rf-team-section';
  teamDiv.innerHTML = '<div class="spinner" style="font-size:12px">팀원 현황 로딩...</div>';
  el.appendChild(teamDiv);

  try {
    const data = await API.get(`/rf/auto?period=${encodeURIComponent(periodLabel)}`);
    const members = (data.team || []).filter(m => !m.is_self);
    if (!members.length) { teamDiv.remove(); return; }

    let html = `<div style="margin-top:16px;border-top:2px solid var(--o100);padding-top:12px">
      <div style="font-size:13px;font-weight:600;color:var(--o700);margin-bottom:10px">👥 팀원 보고·피드백 현황</div>`;

    members.forEach(m => {
      const phaseLabel = {
        draft:'목표작성중', pending:'승인대기', approved:'목표확정',
        final_self:'자기평가중', final_mgr_pending:'상사평가대기', final_done:'평가완료'
      }[m.eval?.phase] || m.eval?.phase || '';

      const rList = (m.reports || []).map(r => {
        const d = (r.created_at||'').slice(0,10);
        const gn = r.goal_name ? `<span style="font-size:10px;color:var(--muted)">[${escapeHtml(r.goal_name)}]</span> ` : '';
        return `<div style="padding:4px 0;border-bottom:1px solid var(--o50);font-size:12px">
          📝 ${gn}${escapeHtml(r.content||'').slice(0,60)}${(r.content||'').length>60?'…':''} <span style="color:var(--muted)">${d}</span>
        </div>`;
      }).join('');

      const fbList = (m.feedbacks || []).map(fb => {
        const sc = fb.items?.reduce((a,it)=>a+(it.score||0),0) || 0;
        const cnt = fb.items?.length || 0;
        const avg = cnt ? (sc/cnt).toFixed(1) : '-';
        return `<div style="padding:4px 0;border-bottom:1px solid var(--o50);font-size:12px">
          💬 피드백 — 평균 ${avg}점 <span style="color:var(--muted)">${(fb.created_at||'').slice(0,10)}</span>
        </div>`;
      }).join('');

      html += `<div class="card" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div class="avatar" style="width:28px;height:28px;font-size:10px;background:var(--o100);color:var(--o800);flex-shrink:0">${(m.user.name||'?').slice(0,2)}</div>
          <div>
            <span style="font-weight:600;font-size:13px">${escapeHtml(m.user.name||'')}</span>
            <span style="font-size:11px;color:var(--muted);margin-left:6px">${escapeHtml(m.user.dept||'')} · ${escapeHtml(m.user.title||'')}</span>
          </div>
          <span class="bd" style="margin-left:auto;font-size:10px">${phaseLabel}</span>
        </div>
        ${rList || fbList ? `<div>${rList}${fbList}</div>` : `<div style="font-size:12px;color:var(--muted)">이 기간에 보고·피드백이 없습니다.</div>`}
        ${m.can_feedback ? `<div style="margin-top:10px;border-top:1px solid var(--o100);padding-top:8px">
          <div id="inline-fb-display-${m.eval.id}" style="margin-bottom:4px"></div>
          <button class="btn btn-ghost btn-sm" onclick="toggleInlineFeedbackForm(${m.eval.id})">💬 피드백 작성</button>
          <div id="inline-fb-form-${m.eval.id}" style="display:none;margin-top:8px"></div>
        </div>` : ''}
      </div>`;
    });

    html += '</div>';
    teamDiv.innerHTML = html;
  } catch(e) {
    teamDiv.innerHTML = `<div style="font-size:12px;color:var(--muted)">팀원 현황 로드 실패: ${e.message}</div>`;
  }
}

/* ── 레거시 [목표명] 파서 ── */
function parseLegacyReports(legacyReports, goals) {
  const byGoal = [];
  const summary = [];

  for (const report of legacyReports) {
    if (!report.content) continue;
    const sections = report.content.split(/\n(?=\[)/);
    let matchedAny = false;

    for (const section of sections) {
      const m = section.match(/^\[([^\]]+)\]\n?([\s\S]*)$/);
      if (!m) continue;
      const [, tag, body] = m;
      const tagT = tag.trim(), bodyT = body.trim();
      if (!bodyT) continue;

      if (tagT === '종합의견') {
        summary.push({ id:`ls-${report.id}`, original_id:report.id, content:bodyT, round:report.round||1, created_at:report.created_at, is_legacy:true });
        matchedAny = true;
      } else {
        const g = goals.find(x => x.name === tagT);
        if (g) {
          byGoal.push({ id:`lg-${report.id}-${g.id}`, original_id:report.id, goal_id:g.id, goal_name:g.name, content:bodyT, round:report.round||1, created_at:report.created_at, is_legacy:true });
          matchedAny = true;
        }
      }
    }

    if (!matchedAny) {
      summary.push({ id:`lu-${report.id}`, original_id:report.id, content:report.content, round:report.round||1, created_at:report.created_at, is_legacy:true, unmatched:true });
    }
  }

  return { byGoal, summary };
}

function groupByGoalId(items) {
  const map = {};
  for (const item of items) {
    const key = item.goal_id;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}

function groupFeedbacksByGoal(feedbacks, goals) {
  const map = {};
  for (const fb of feedbacks) {
    for (const it of (fb.items || [])) {
      if (!map[it.goal_id]) map[it.goal_id] = [];
      map[it.goal_id].push({ ...it, type:'feedback', created_at:fb.created_at, author_name:fb.author_name });
    }
  }
  return map;
}

function mergeByRound(reports, feedbackItems) {
  const rounds = {};

  // 보고를 회차별로 그룹 + 각 회차의 마지막 보고 시각 추적
  for (const r of reports) {
    const rnd = r.round || 1;
    if (!rounds[rnd]) rounds[rnd] = { round:rnd, items:[], maxReportTime:0 };
    rounds[rnd].items.push({ ...r, type:'report' });
    const t = new Date(r.created_at).getTime() || 0;
    if (t > rounds[rnd].maxReportTime) rounds[rnd].maxReportTime = t;
  }

  // 피드백을 시간적으로 가장 가까운 이전 보고 회차에 배정
  const roundNums = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  for (const f of feedbackItems) {
    const fbTime = new Date(f.created_at).getTime() || 0;
    // 피드백 시각 이전에 제출된 보고 회차 중 가장 마지막 회차
    let assignedRound = roundNums.length ? roundNums[0] : 1;
    for (const rnd of roundNums) {
      if (rounds[rnd].maxReportTime <= fbTime) assignedRound = rnd;
    }
    if (!rounds[assignedRound]) rounds[assignedRound] = { round:assignedRound, items:[], maxReportTime:0 };
    rounds[assignedRound].items.push({ ...f, type:'feedback' });
  }

  return Object.values(rounds).sort((a, b) => b.round - a.round);
}

/* ── 목표별 카드 ── */
function renderGoalCard(goal, reports, feedbackItems, isSelf) {
  const rounds = mergeByRound(reports, feedbackItems);
  const totalRounds = rounds.length;
  if (totalRounds === 0) {
    return `<div class="card goal-report-card" data-goal-id="${goal.id}">
      <div class="card-header"><div><div class="card-header-t">🎯 ${escapeHtml(goal.name)}</div></div></div>
      <div style="padding:14px;text-align:center;color:var(--muted);font-size:13px;background:var(--o50);border-radius:6px">아직 작성된 보고 또는 피드백이 없습니다.</div>
    </div>`;
  }

  const initial = rounds.slice(0, 3);
  const hidden  = rounds.slice(3);

  // onclick 인라인 JSON 대신 window 캐시 사용 (특수문자 이슈 방지)
  window._rfHiddenRounds = window._rfHiddenRounds || {};
  if (hidden.length) window._rfHiddenRounds[goal.id] = hidden;

  return `<div class="card goal-report-card" data-goal-id="${goal.id}">
    <div class="card-header"><div>
      <div class="card-header-t">🎯 ${escapeHtml(goal.name)}</div>
      <div class="card-header-s">가중치 ${goal.weight||0}% · 총 ${totalRounds}회차</div>
    </div></div>
    <div id="rounds-${goal.id}" class="round-list">
      ${initial.map(r => renderRoundBlock(r)).join('')}
    </div>
    ${hidden.length ? `<div class="more-controls" id="more-${goal.id}">
      <button class="btn btn-ghost btn-sm" onclick="showMoreRounds(${goal.id})">이전 회차 더보기 (남은 ${hidden.length}회차)</button>
    </div>` : ''}
  </div>`;
}

function renderRoundBlock(round) {
  const items = [...round.items].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return `<div class="round-block" data-round="${round.round}">
    <div class="round-header"><strong>${round.round}회차</strong></div>
    <div class="round-items">
      ${items.map(item => item.type === 'report' ? renderReportItem(item, window._rfMode === 'team_auto') : renderFeedbackItem(item)).join('')}
    </div>
  </div>`;
}

function renderReportItem(item, isSelf) {
  const d = (item.created_at||'').slice(0,16).replace('T',' ');
  const selfBadge = isSelf ? '<span class="bd" style="background:var(--teal,#0d7c6b);color:white;font-size:10px;margin-left:4px">본인</span>' : '';
  return `<div class="item-block report-block">
    <div class="item-header">📝 보고 · ${d}${item.is_legacy?'<span class="bd-legacy">레거시</span>':''}${selfBadge}</div>
    <div class="item-content">${escapeHtml(item.content||'')}</div>
  </div>`;
}

function renderFeedbackItem(item) {
  const d = (item.created_at||'').slice(0,16).replace('T',' ');
  const sc = item.score||0;
  const stars = '★'.repeat(sc)+'☆'.repeat(5-sc);
  return `<div class="item-block feedback-block">
    <div class="item-header">💬 피드백 · ${d} · ${stars} (${sc}점) · ${escapeHtml(item.author_name||'상사')}</div>
    <div class="item-content">${escapeHtml(item.note||'')}</div>
  </div>`;
}

function showMoreRounds(goalId) {
  try {
    const cache = window._rfHiddenRounds || {};
    const hidden = cache[goalId];
    if (!hidden || !hidden.length) return;

    const container = document.getElementById('rounds-' + goalId);
    if (!container) return;

    const next3 = hidden.slice(0, 3);
    next3.forEach(r => container.insertAdjacentHTML('beforeend', renderRoundBlock(r)));

    const remaining = hidden.slice(3);
    cache[goalId] = remaining;  // 캐시 갱신

    const moreDiv = document.getElementById('more-' + goalId);
    if (!moreDiv) return;
    if (remaining.length === 0) {
      moreDiv.remove();
    } else {
      moreDiv.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="showMoreRounds(${goalId})">이전 회차 더보기 (남은 ${remaining.length}회차)</button>`;
    }
  } catch(e) { console.warn('showMoreRounds error:', e); }
}

/* ── 종합 카드 ── */
function renderSummaryCard(legacySummary, newSummaryReports, feedbacks) {
  const summaryRpts = [...newSummaryReports, ...legacySummary]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const summaryFbs = feedbacks
    .filter(f => f.overall_note)
    .map(f => ({ type:'feedback', content:f.overall_note, created_at:f.created_at, author_name:f.author_name, score:0 }));

  const allItems = [
    ...summaryRpts.map(r => ({ ...r, type:'report' })),
    ...summaryFbs
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // 종합 카드 더보기 캐시 (goal 카드와 동일 패턴)
  window._rfSummaryItems = window._rfSummaryItems || {};
  const summaryKey = 'summary';
  const shown = allItems.slice(0, 10);
  const hiddenSummary = allItems.slice(10);
  if (hiddenSummary.length) window._rfSummaryItems[summaryKey] = hiddenSummary;

  return `<div class="card summary-card">
    <div class="card-header"><div><div class="card-header-t">📋 종합 보고·피드백</div></div></div>
    <div id="summary-items">
      ${allItems.length === 0
        ? '<div style="padding:14px;text-align:center;color:var(--muted);font-size:13px">아직 종합 의견이 없습니다.</div>'
        : shown.map(item => item.type === 'report' ? renderReportItem(item) : renderFeedbackItem(item)).join('')}
    </div>
    ${hiddenSummary.length ? `<div class="more-controls" id="more-summary">
      <button class="btn btn-ghost btn-sm" onclick="showMoreSummary()">더보기 (${hiddenSummary.length}건 더)</button>
    </div>` : ''}
  </div>`;
}

function showMoreSummary() {
  try {
    const cache = window._rfSummaryItems || {};
    const hidden = cache['summary'];
    if (!hidden || !hidden.length) return;
    const container = document.getElementById('summary-items');
    if (!container) return;
    const next = hidden.slice(0, 10);
    next.forEach(item => {
      container.insertAdjacentHTML('beforeend',
        item.type === 'report' ? renderReportItem(item) : renderFeedbackItem(item)
      );
    });
    const remaining = hidden.slice(10);
    cache['summary'] = remaining;
    const moreDiv = document.getElementById('more-summary');
    if (!moreDiv) return;
    if (remaining.length === 0) {
      moreDiv.remove();
    } else {
      moreDiv.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="showMoreSummary()">더보기 (${remaining.length}건 더)</button>`;
    }
  } catch(e) { console.warn('showMoreSummary error:', e); }
}

/* ── 보고 작성 폼 ── */
function renderWriteForm(ev, goals) {
  const evalId = typeof ev === 'object' ? ev.id : ev;
  const goalInputs = goals.map(g => `
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:500;color:var(--o800);display:block;margin-bottom:3px">
        ${escapeHtml(g.name)}<span style="font-size:11px;color:var(--muted);font-weight:400"> (${g.weight}%)</span>
      </label>
      <textarea id="rf-goal-${evalId}-${g.id}" placeholder="${escapeHtml(g.name)}의 현재 진행 상황..."
        style="width:100%;min-height:56px;resize:vertical"></textarea>
    </div>`).join('');

  const modeLabel = ev.eval_mode || 'MBO';
  return `<div class="card" style="margin-top:16px;border-top:3px solid var(--o200)">
    <div class="card-header"><div>
      <div class="card-header-t">✏️ 새 보고 작성
        <span style="font-weight:400;font-size:13px;opacity:.85;margin-left:8px">· ${escapeHtml(ev.period_label||'')} · ${escapeHtml(modeLabel)}</span>
      </div>
    </div></div>
    <div>
      ${goalInputs}
      <div style="margin-bottom:10px">
        <label style="font-size:12px;font-weight:500;color:var(--o600);display:block;margin-bottom:3px">종합 의견</label>
        <textarea id="rf-overall-${evalId}" placeholder="전체 진행 상황, 이슈, 지원 요청 사항..."
          style="width:100%;min-height:80px;resize:vertical"></textarea>
      </div>
      <div class="abar">
        <button class="btn btn-teal" onclick="submitRFReport(${evalId})">보고 제출</button>
      </div>
    </div>
  </div>`;
}

async function submitRFReport(evalId) {
  const goals = await API.get(`/evals/${evalId}/goals`).catch(() => []);
  const items = goals
    .map(g => ({ goal_id: g.id, content: (document.getElementById(`rf-goal-${evalId}-${g.id}`)?.value||'').trim() }))
    .filter(x => x.content);
  const overall = (document.getElementById(`rf-overall-${evalId}`)?.value||'').trim();

  if (!items.length && !overall) {
    showAlert('보고 내용을 입력해주세요.', 'orange');
    return;
  }

  try {
    const res = await API.post(`/reports/${evalId}`, { items, overall, files:[] });
    showAlert(`${res.round}회차 보고가 제출되었습니다.`, 'teal');
    setTimeout(() => Pages.myReportFeedback(), 600);
  } catch(e) { showAlert(e.message, 'red'); }
}

/* ── RF-VIEW-2B: 검색 패널 (search 모드 — 3필터: 조직/대상자/기간) ── */
let _rfSubData = null;  // 캐시: { users, orgs }

async function renderRFSearchPanel(area) {
  const panel = document.createElement('div');
  panel.id = 'rf-search-panel';
  panel.innerHTML = '<div class="spinner">검색 패널 로딩...</div>';
  area.appendChild(panel);

  try {
    const [scData, periods] = await Promise.all([
      API.get('/my-subordinates'),
      API.get('/eval-periods'),
    ]);
    _rfSubData = scData;  // {users, orgs}
    const users = scData.users || [];
    const orgs  = scData.orgs  || [];
    const sortedPeriods = typeof sortPeriodsDesc === 'function' ? sortPeriodsDesc(periods) : periods;

    panel.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div class="card-header"><div><div class="card-header-t">🔍 보고·피드백 검색</div>
          <div class="card-header-s">기간은 필수, 조직·대상자는 선택 (미선택=권한 범위 전원)</div></div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
          <div style="flex:1;min-width:140px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">조직</label>
            <select id="rf-search-org" style="width:100%;height:34px;font-size:13px" onchange="rfOrgFilter()">
              <option value="">전체</option>
              ${orgs.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
            </select>
          </div>
          <div style="flex:1;min-width:160px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">대상자</label>
            <select id="rf-search-user" style="width:100%;height:34px;font-size:13px">
              <option value="">전체</option>
              ${users.map(u => `<option value="${u.id}" data-org="${u.org_id||''}">${u.name} (${u.dept||'-'} · ${u.title||'-'})</option>`).join('')}
            </select>
          </div>
          <div style="flex:1;min-width:130px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">평가 기간 <span style="color:var(--red)">*</span></label>
            <select id="rf-search-period" style="width:100%;height:34px;font-size:13px">
              <option value="">선택하세요</option>
              ${sortedPeriods.map(p => `<option value="${encodeURIComponent(p.period_label)}">${p.period_label}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary" style="height:34px;flex-shrink:0" onclick="executeRFSearch()">조회</button>
        </div>
      </div>
      <div id="rf-search-result"></div>`;
  } catch(e) {
    panel.innerHTML = `<div class="alert alert-red">검색 패널 로드 실패: ${e.message}</div>`;
  }
}

// 조직 선택 시 대상자 드롭다운 필터
function rfOrgFilter() {
  const orgId = document.getElementById('rf-search-org')?.value;
  const userSel = document.getElementById('rf-search-user');
  if (!userSel) return;
  userSel.querySelectorAll('option').forEach(opt => {
    if (!opt.value) { opt.hidden = false; return; }  // 전체 옵션 항상 표시
    opt.hidden = orgId ? String(opt.dataset.org) !== String(orgId) : false;
  });
  // 현재 선택이 숨겨진 경우 초기화
  if (userSel.selectedOptions[0]?.hidden) userSel.value = '';
}

async function executeRFSearch() {
  const orgId   = document.getElementById('rf-search-org')?.value;
  const userId  = document.getElementById('rf-search-user')?.value;
  const periodE = document.getElementById('rf-search-period')?.value;
  const result  = document.getElementById('rf-search-result');
  if (!periodE) { showAlert('기간을 선택하세요.', 'orange'); return; }
  const period = decodeURIComponent(periodE);
  result.innerHTML = '<div class="spinner">조회 중...</div>';
  try {
    let url = `/rf/search?period=${encodeURIComponent(period)}`;
    if (userId)  url += `&user_id=${userId}`;
    else if (orgId) url += `&org_id=${orgId}`;

    const data = await API.get(url);  // 항상 배열 반환
    const items = Array.isArray(data) ? data : (data.eval ? [data] : []);

    if (!items.length) {
      result.innerHTML = `<div class="card"><div class="alert alert-orange">해당 조건에 평가 데이터가 없습니다.</div></div>`;
      return;
    }

    // 조회 헤더
    const orgName  = orgId ? (_rfSubData?.orgs||[]).find(o=>String(o.id)===String(orgId))?.name||'조직' : '';
    const userName = userId ? (_rfSubData?.users||[]).find(u=>String(u.id)===String(userId))?.name||'' : '';
    const scopeLabel = userName ? userName : orgName ? `${orgName} 산하` : '전체';
    result.innerHTML = `<div style="font-size:13px;color:var(--muted);margin-bottom:10px">
      📋 조회: ${escapeHtml(scopeLabel)} · ${escapeHtml(period)} · ${items.length}명
    </div>`;

    items.forEach(m => {
      const phaseLabel = {
        draft:'목표작성중', pending:'승인대기', approved:'목표확정',
        final_self:'자기평가중', final_mgr_pending:'상사평가대기',
        final_mgr2_pending:'2차평가대기', final_done:'평가완료'
      }[m.eval?.phase] || m.eval?.phase || '';

      const rList = (m.reports || []).map(r => {
        const d = (r.created_at||'').slice(0,10);
        const gn = r.goal_name ? `<span style="font-size:10px;color:var(--muted)">[${escapeHtml(r.goal_name)}]</span> ` : '';
        const selfBadge = m.is_self ? '<span class="bd" style="background:var(--teal,#0d7c6b);color:white;font-size:10px;margin-left:4px">본인</span>' : '';
        return `<div style="padding:6px 0;border-bottom:1px solid var(--o50);font-size:13px">
          📝 ${gn}${escapeHtml(r.content||'')}${selfBadge} <span style="color:var(--muted);font-size:11px">${d}</span>
        </div>`;
      }).join('');

      const fbList = (m.feedbacks || []).flatMap(fb => (fb.items||[]).map(it => {
        const sc = it.score || 0;
        const stars = '★'.repeat(sc)+'☆'.repeat(5-sc);
        return `<div style="padding:6px 0;border-bottom:1px solid var(--o50);font-size:13px">
          💬 ${escapeHtml(it.note||'(내용 없음)')} ${stars}(${sc}점)
          <span style="color:var(--muted);font-size:11px">${escapeHtml(fb.author_name||'상사')}</span>
        </div>`;
      })).join('');

      result.innerHTML += `<div class="card" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div class="avatar" style="width:28px;height:28px;font-size:10px;background:var(--o100);color:var(--o800);flex-shrink:0">${(m.user.name||'?').slice(0,2)}</div>
          <div>
            <span style="font-weight:600">${escapeHtml(m.user.name||'')}</span>
            <span style="font-size:11px;color:var(--muted);margin-left:6px">${escapeHtml(m.user.dept||'')} · ${escapeHtml(m.user.title||'')}</span>
          </div>
          <span class="bd" style="margin-left:auto">${phaseLabel}</span>
        </div>
        ${rList || fbList
          ? `<div>${rList||''}${fbList||''}</div>`
          : `<div class="alert alert-orange" style="font-size:12px">보고·피드백이 없습니다.</div>`}
        ${m.can_feedback ? `<div style="margin-top:10px;border-top:1px solid var(--o100);padding-top:8px">
          <div id="inline-fb-display-${m.eval.id}" style="margin-bottom:4px"></div>
          <button class="btn btn-ghost btn-sm" onclick="toggleInlineFeedbackForm(${m.eval.id})">💬 피드백 작성</button>
          <div id="inline-fb-form-${m.eval.id}" style="display:none;margin-top:8px"></div>
        </div>` : ''}
      </div>`;
    });
  } catch(e) {
    result.innerHTML = `<div class="alert alert-red">${e.message}</div>`;
  }
}

/* ── UNIFY-2: 인라인 피드백 작성 ── */
let _inlineFbStars = {};

async function toggleInlineFeedbackForm(evalId) {
  const formDiv = document.getElementById(`inline-fb-form-${evalId}`);
  if (!formDiv) return;
  if (formDiv.style.display !== 'none') {
    formDiv.style.display = 'none';
    return;
  }
  formDiv.innerHTML = '<div style="font-size:12px;color:var(--muted)">로딩...</div>';
  formDiv.style.display = 'block';
  try {
    const goals = await API.get(`/evals/${evalId}/goals`);
    formDiv.innerHTML = _buildInlineFbForm(evalId, goals);
    _initInlineFbStars(evalId, goals);
  } catch(e) {
    formDiv.innerHTML = `<div style="font-size:12px;color:var(--red)">${e.message}</div>`;
  }
}

function _buildInlineFbForm(evalId, goals) {
  const goalInputs = goals.map(g => `
    <div style="padding:8px 0;border-bottom:1px solid var(--o50)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:6px">
        <span style="font-size:13px;font-weight:500">${escapeHtml(g.name)}</span>
        <div id="ifbs-${evalId}-${g.id}"></div>
      </div>
      <textarea id="ifbn-${evalId}-${g.id}" placeholder="${escapeHtml(g.name)}에 대한 피드백..."
        style="width:100%;min-height:48px;resize:vertical"></textarea>
    </div>`).join('');

  return `<div>
    ${goalInputs}
    <div style="margin-top:10px">
      <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">종합 피드백</label>
      <textarea id="ifbo-${evalId}" placeholder="전체 방향성, 개선 사항, 격려 메시지..."
        style="width:100%;min-height:64px;resize:vertical"></textarea>
    </div>
    <div class="abar" style="margin-top:10px">
      <button class="btn btn-teal btn-sm" onclick="submitInlineFeedback(${evalId},'${goals.map(g=>g.id).join(',')}')">피드백 제출</button>
    </div>
  </div>`;
}

function _initInlineFbStars(evalId, goals) {
  goals.forEach(g => {
    const container = document.getElementById(`ifbs-${evalId}-${g.id}`);
    if (!container) return;
    container.innerHTML = [1,2,3,4,5].map(n =>
      `<span data-gk="${evalId}-${g.id}" data-val="${n}"
        onclick="setInlineFbStar(${evalId},${g.id},${n})"
        style="font-size:20px;cursor:pointer;color:var(--o300)">☆</span>`
    ).join('');
  });
}

function setInlineFbStar(evalId, goalId, value) {
  const key = `${evalId}-${goalId}`;
  _inlineFbStars[key] = value;
  const container = document.getElementById(`ifbs-${evalId}-${goalId}`);
  if (!container) return;
  container.querySelectorAll('span').forEach(sp => {
    const v = Number(sp.dataset.val);
    sp.style.color = v <= value ? 'var(--o500)' : 'var(--o300)';
    sp.textContent = v <= value ? '★' : '☆';
  });
}

async function submitInlineFeedback(evalId, goalIdsStr) {
  const goalIds = goalIdsStr.split(',').filter(Boolean);
  const items = goalIds.map(gid => ({
    goal_id: gid,
    score: _inlineFbStars[`${evalId}-${gid}`] || null,
    note: document.getElementById(`ifbn-${evalId}-${gid}`)?.value || ''
  })).filter(it => it.score || it.note?.trim());
  const overall = document.getElementById(`ifbo-${evalId}`)?.value || '';

  if (!items.length && !overall.trim()) {
    showAlert('피드백 내용을 입력해주세요.', 'orange');
    return;
  }
  try {
    await API.post(`/feedback/${evalId}`, { overall_note: overall, items });
    showAlert('피드백이 제출되었습니다!', 'teal');
    const formDiv = document.getElementById(`inline-fb-form-${evalId}`);
    if (formDiv) formDiv.style.display = 'none';
    _refreshInlineFbDisplay(evalId);
  } catch(e) { showAlert(e.message, 'red'); }
}

async function _refreshInlineFbDisplay(evalId) {
  const displayDiv = document.getElementById(`inline-fb-display-${evalId}`);
  if (!displayDiv) return;
  try {
    const feedbacks = await API.get(`/feedback/${evalId}`);
    const myFbs = feedbacks.filter(f => String(f.author_id) === String(App.user.id));
    if (!myFbs.length) return;
    displayDiv.innerHTML = myFbs.map(fb => {
      const scores = (fb.items||[]).map(it=>it.score||0).filter(s=>s>0);
      const avg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : '-';
      return `<div style="padding:3px 0;font-size:12px;color:var(--teal)">
        ✓ 내 피드백 — 평균 ${avg}점 · ${(fb.created_at||'').slice(0,10)}
      </div>`;
    }).join('');
  } catch(e) {}
}
