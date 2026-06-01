/* ── 보고·피드백 통합 페이지 (PROMPT 64B) ── */
var Pages = window.Pages || {};

Pages.myReportFeedback = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const evs = await API.get('/evals');
    const myEvs = evs.filter(e =>
      String(e.user_id) === String(App.user.id) &&
      ['approved','final_self','final_mgr_pending','final_done'].includes(e.phase)
    );

    if (!myEvs.length) {
      area.innerHTML = `<div class="card"><div class="alert alert-orange">목표가 확정된 후 보고·피드백을 확인할 수 있습니다.</div></div>`;
      return;
    }

    area.innerHTML = '';

    window._rfEvs = myEvs;  // lazy 렌더링용 캐시
    if (myEvs.length > 1) {
      const tabEl = document.createElement('div');
      tabEl.className = 'stabs';
      tabEl.innerHTML = myEvs.map((ev, i) =>
        `<button class="stb${i===0?' active':''}" id="stb-rf-${ev.id}" onclick="switchRFTab(${ev.id})">${ev.period_label}</button>`
      ).join('');
      area.appendChild(tabEl);
    }

    for (let i = 0; i < myEvs.length; i++) {
      const ev = myEvs[i];
      const sp = document.createElement('div');
      sp.id = 'rf-pane-' + ev.id;
      sp.className = i === 0 ? '' : 'rf-hidden';
      sp.innerHTML = '<div class="spinner">로딩 중...</div>';
      area.appendChild(sp);
    }
    // 첫 pane만 즉시 렌더, 나머지는 탭 클릭 시 lazy
    renderRFPane(myEvs[0]);
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
    const summaryReports = reports.filter(r => (r.goal_id === null || r.goal_id === undefined) && !legacyReports.includes(r));

    const canReport = ['approved','final_self','final_mgr_pending'].includes(ev.phase);

    let html = `<div style="font-size:13px;color:var(--muted);margin-bottom:12px">${ev.period_label} · ${ev.eval_mode||'MBO'}</div>`;

    goals.forEach(g => {
      html += renderGoalCard(g, reportsByGoal[g.id] || [], fbsByGoal[g.id] || []);
    });

    html += renderSummaryCard([...parsed.summary], reports.filter(r => r.goal_id === null && !legacyReports.find(lr=>lr.id===r.id)).concat([]), feedbacks);

    if (canReport) html += renderWriteForm(ev.id, goals);

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
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

  for (const r of reports) {
    const rnd = r.round || 1;
    if (!rounds[rnd]) rounds[rnd] = { round:rnd, items:[] };
    rounds[rnd].items.push({ ...r, type:'report' });
  }

  for (const f of feedbackItems) {
    const rnd = f.round || 1;
    if (!rounds[rnd]) rounds[rnd] = { round:rnd, items:[] };
    rounds[rnd].items.push({ ...f, type:'feedback' });
  }

  return Object.values(rounds).sort((a, b) => b.round - a.round);
}

/* ── 목표별 카드 ── */
function renderGoalCard(goal, reports, feedbackItems) {
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
  const hiddenJson = JSON.stringify(hidden).replace(/"/g, '&quot;');

  return `<div class="card goal-report-card" data-goal-id="${goal.id}">
    <div class="card-header"><div>
      <div class="card-header-t">🎯 ${escapeHtml(goal.name)}</div>
      <div class="card-header-s">가중치 ${goal.weight||0}% · 총 ${totalRounds}회차</div>
    </div></div>
    <div id="rounds-${goal.id}" class="round-list">
      ${initial.map(r => renderRoundBlock(r)).join('')}
    </div>
    ${hidden.length ? `<div class="more-controls" id="more-${goal.id}">
      <button class="btn btn-ghost btn-sm" onclick="showMoreRounds(${goal.id}, '${hiddenJson}')">이전 회차 더보기 (남은 ${hidden.length}회차)</button>
    </div>` : ''}
  </div>`;
}

function renderRoundBlock(round) {
  const items = [...round.items].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return `<div class="round-block" data-round="${round.round}">
    <div class="round-header"><strong>${round.round}회차</strong></div>
    <div class="round-items">
      ${items.map(item => item.type === 'report' ? renderReportItem(item) : renderFeedbackItem(item)).join('')}
    </div>
  </div>`;
}

function renderReportItem(item) {
  const d = (item.created_at||'').slice(0,16).replace('T',' ');
  return `<div class="item-block report-block">
    <div class="item-header">📝 보고 · ${d}${item.is_legacy?'<span class="bd-legacy">레거시</span>':''}</div>
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

function showMoreRounds(goalId, hiddenJson) {
  try {
    const hidden = JSON.parse(hiddenJson.replace(/&quot;/g, '"'));
    const container = document.getElementById('rounds-' + goalId);
    const next3 = hidden.slice(0, 3);
    next3.forEach(r => container.insertAdjacentHTML('beforeend', renderRoundBlock(r)));
    const remaining = hidden.slice(3);
    const moreDiv = document.getElementById('more-' + goalId);
    if (!moreDiv) return;
    if (remaining.length === 0) {
      moreDiv.remove();
    } else {
      const newJson = JSON.stringify(remaining).replace(/"/g, '&quot;');
      moreDiv.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="showMoreRounds(${goalId}, '${newJson}')">이전 회차 더보기 (남은 ${remaining.length}회차)</button>`;
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

  const shown = allItems.slice(0, 10);

  return `<div class="card summary-card">
    <div class="card-header"><div><div class="card-header-t">📋 종합 보고·피드백</div></div></div>
    ${allItems.length === 0
      ? '<div style="padding:14px;text-align:center;color:var(--muted);font-size:13px">아직 종합 의견이 없습니다.</div>'
      : shown.map(item => item.type === 'report' ? renderReportItem(item) : renderFeedbackItem(item)).join('')}
    ${allItems.length > 10 ? `<div class="more-controls"><button class="btn btn-ghost btn-sm">더보기 (${allItems.length-10}건)</button></div>` : ''}
  </div>`;
}

/* ── 보고 작성 폼 ── */
function renderWriteForm(evalId, goals) {
  const goalInputs = goals.map(g => `
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:500;color:var(--o800);display:block;margin-bottom:3px">
        ${escapeHtml(g.name)}<span style="font-size:11px;color:var(--muted);font-weight:400"> (${g.weight}%)</span>
      </label>
      <textarea id="rf-goal-${evalId}-${g.id}" placeholder="${escapeHtml(g.name)}의 현재 진행 상황..."
        style="width:100%;min-height:56px;resize:vertical"></textarea>
    </div>`).join('');

  return `<div class="card" style="margin-top:16px;border-top:3px solid var(--o200)">
    <div class="card-header"><div><div class="card-header-t">✏️ 새 보고 작성</div></div></div>
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
