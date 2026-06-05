Pages.feedback = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';

  const evs = await API.get('/evals');

  // 내 eval 중 가장 최신 활성 기간 선택 (periodSortKey 이용 — created_at null 대응)
  const myEvCandidates = evs.filter(e =>
    String(e.user_id) === String(App.user.id) &&
    ['approved','final_self','final_mgr_pending','final_done'].includes(e.phase)
  );
  const myEv = (typeof sortPeriodsDesc === 'function')
    ? sortPeriodsDesc(myEvCandidates)[0]
    : myEvCandidates[0];

  // 내가 승인자인 직원들 — 직원별 가장 최신 eval 1개만 (periodSortKey 기준, created_at null 대응)
  const reporteeRaw = evs.filter(e =>
    String(e.user_id) !== String(App.user.id) &&
    ['approved','final_self','final_mgr_pending','final_done'].includes(e.phase)
  );
  const reporteeMap = {};
  reporteeRaw.forEach(e => {
    const uid = String(e.user_id);
    if (!reporteeMap[uid]) {
      reporteeMap[uid] = e;
    } else {
      const prev = reporteeMap[uid];
      const prevKey = typeof periodSortKey === 'function' ? periodSortKey(prev) : 0;
      const curKey  = typeof periodSortKey === 'function' ? periodSortKey(e)    : 0;
      if (curKey > prevKey) reporteeMap[uid] = e;
    }
  });
  const reporteeEvs = Object.values(reporteeMap);

  area.innerHTML = '';
  const tabsEl = document.createElement('div');
  tabsEl.className = 'stabs';

  const tabs = [];
  if (myEv && ['approved','final_self','final_mgr_pending','final_done'].includes(myEv.phase))
    tabs.push({ id:'fb-mine', label:'받은 피드백' });
  if (reporteeEvs.length)
    tabs.push({ id:'fb-give', label:`피드백 작성 (${reporteeEvs.length}명)` });
  if (!tabs.length) {
    area.innerHTML = '<div class="card"><div class="alert alert-orange">목표가 승인된 평가가 없습니다. 목표 설정 후 승인을 받아주세요.</div></div>';
    return;
  }

  tabsEl.innerHTML = tabs.map((t,i)=>
    `<button class="stb${i===0?' active':''}" id="stb-${t.id}" onclick="switchFbTab('${t.id}')">${t.label}</button>`
  ).join('');
  area.appendChild(tabsEl);

  tabs.forEach((t,i) => {
    const sp = document.createElement('div');
    sp.className = 'sp' + (i===0?' active':'');
    sp.id = t.id;
    area.appendChild(sp);
  });

  if (tabs[0]?.id === 'fb-mine') renderReceivedFeedback(myEv);
  if (tabs.some(t=>t.id==='fb-give')) renderGiveFeedback(reporteeEvs, evs);
};

function switchFbTab(id) {
  document.querySelectorAll('.stb').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.sp').forEach(s=>s.classList.remove('active'));
  document.getElementById('stb-'+id)?.classList.add('active');
  document.getElementById(id)?.classList.add('active');
}

async function renderReceivedFeedback(ev) {
  const el = document.getElementById('fb-mine'); if(!el) return;
  const fbs = await API.get(`/feedback/${ev.id}`);
  if (!fbs.length) {
    el.innerHTML = '<div class="alert alert-orange">아직 받은 피드백이 없습니다.</div>'; return;
  }
  const goals = await API.get(`/evals/${ev.id}/goals`);
  el.innerHTML = fbs.map(fb => {
    const items = fb.items || [];
    return `<div class="fb-entry">
      <div class="fb-meta">
        <span class="bd bd-fb">${fb.author_name}의 피드백 · ${fb.created_at?.slice(0,10)||''}</span>
      </div>
      ${items.filter(it=>it.note||it.score).map(it => {
        const g = goals.find(x=>String(x.id)===String(it.goal_id));
        return `<div style="padding:5px 0;border-bottom:1px solid var(--o50)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
            <span style="font-size:13px;font-weight:500">${g?.name||'목표'}</span>
            ${it.score?`<span style="font-size:11px;background:var(--o100);color:var(--o800);padding:1px 8px;border-radius:10px;font-weight:500">${scoreLabel(it.score)}</span>`:''}
          </div>
          ${it.note?`<div style="font-size:13px;color:var(--muted)">${it.note}</div>`:''}
        </div>`;
      }).join('')}
      ${fb.overall_note?`<div style="margin-top:8px;padding:8px;background:var(--white);border-radius:6px;font-size:13px">${fb.overall_note}</div>`:''}
    </div>`;
  }).join('');
}

async function renderGiveFeedback(reporteeEvs, allEvs) {
  const el = document.getElementById('fb-give'); if(!el) return;
  el.innerHTML = '';

  for (const ev of reporteeEvs) {
    const [goals, prevFbs] = await Promise.all([
      API.get(`/evals/${ev.id}/goals`),
      API.get(`/feedback/${ev.id}`),
    ]);
    const myPrevFbs = prevFbs.filter(f => String(f.author_id) === String(App.user.id));
    const cardId = `fb-card-${ev.id}`;

    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '8px';

    // ── 헤더 (항상 표시 — 이름 + 접기 버튼) ──────────────
    const hd = document.createElement('div');
    hd.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;gap:8px;flex-wrap:wrap';
    hd.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        <div class="avatar" style="background:var(--o100);color:var(--o800);flex-shrink:0">${(ev.user_name||'?').slice(0,2)}</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--o800)">${ev.user_name||''}
            <span style="font-size:12px;color:var(--muted);font-weight:400"> · ${ev.dept||''} · ${ev.period_label||''}</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            내 피드백 ${myPrevFbs.length}회 제공
            ${prevFbs.length > myPrevFbs.length ? ` · 전체 ${prevFbs.length}건` : ''}
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        ${myPrevFbs.length ? `<span class="bd bd-approved" style="font-size:11px">완료 ${myPrevFbs.length}건</span>` : `<span class="bd bd-draft" style="font-size:11px">미작성</span>`}
        <button class="btn btn-ghost btn-sm" id="toggle-btn-${ev.id}" onclick="toggleFbCard(${ev.id}, event)">
          펼치기 ▼
        </button>
      </div>`;
    card.appendChild(hd);

    // ── 접히는 본문 영역 (기본: 접힌 상태) ───────────────
    const body = document.createElement('div');
    body.id = cardId;
    body.style.cssText = 'display:none;margin-top:14px;border-top:1px solid var(--o100);padding-top:14px';

    // 부하 보고 구조화 표시 (64B: 목표별 그룹화)
    try {
      const reports = await API.get('/reports/' + ev.id).catch(() => []);
      if (reports && reports.length) {
        const rptDiv = document.createElement('div');
        rptDiv.style.cssText = 'background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:10px;margin-bottom:12px';
        rptDiv.innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--o700);margin-bottom:8px">📋 부하 보고 (${reports.length}건)</div>`;

        if (typeof parseLegacyReports === 'function') {
          const legacy = reports.filter(r => r.goal_id === null || r.goal_id === undefined);
          const parsed = parseLegacyReports(legacy, goals);
          const newRpts = reports.filter(r => r.goal_id !== null && r.goal_id !== undefined);
          const byGoal = groupByGoalId ? groupByGoalId([...newRpts, ...parsed.byGoal]) : {};

          goals.forEach(g => {
            const gRpts = byGoal[g.id] || [];
            if (!gRpts.length) return;
            const latest = gRpts.slice().sort((a,b) => new Date(b.created_at)-new Date(a.created_at))[0];
            rptDiv.innerHTML += `<div style="padding:6px 0;border-bottom:1px solid var(--o100)">
              <div style="font-size:12px;font-weight:500;color:var(--o800);margin-bottom:2px">${escapeHtml(g.name)}</div>
              <div style="font-size:12px;color:var(--muted);white-space:pre-wrap;line-height:1.5">${escapeHtml(latest.content||'')}</div>
            </div>`;
          });
        } else {
          // fallback: raw list
          const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
          rptDiv.innerHTML += reports.slice(0, 5).map((r,i) =>
            `<div style="font-size:12px;color:var(--o800);padding:4px 0;border-bottom:1px solid var(--o100)">
              <span style="color:var(--muted);font-size:11px">보고 #${i+1} · ${(r.created_at||'').slice(0,10)}</span><br>
              <span style="white-space:pre-wrap">${esc(r.content||'')}</span>
            </div>`
          ).join('');
        }
        body.appendChild(rptDiv);
      }
    } catch(e) {}

    // 목표별 별점 + 피드백 입력
    const goalsDiv = document.createElement('div');
    goalsDiv.innerHTML = goals.map(g => `
      <div style="padding:8px 0;border-bottom:1px solid var(--o50)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:6px">
          <span style="font-size:13px;font-weight:500">${g.name}</span>
          <div id="fbs-${ev.id}-${g.id}"></div>
        </div>
        <textarea id="fbn-${ev.id}-${g.id}" placeholder="${g.name}에 대한 피드백..."
          style="width:100%;min-height:48px;resize:vertical"></textarea>
      </div>`).join('');
    body.appendChild(goalsDiv);

    // 종합 피드백
    const overallDiv = document.createElement('div');
    overallDiv.style.marginTop = '10px';
    overallDiv.innerHTML = `
      <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">종합 피드백 및 코칭 메시지</label>
      <textarea id="fbo-${ev.id}" placeholder="전체 방향성, 개선 사항, 격려 메시지..."
        style="width:100%;min-height:64px;resize:vertical"></textarea>`;
    body.appendChild(overallDiv);

    // 제출 버튼
    const abar = document.createElement('div');
    abar.className = 'abar';
    abar.style.marginTop = '10px';
    abar.innerHTML = `<button class="btn btn-teal" onclick="submitFeedback(${ev.id},'${goals.map(g=>g.id).join(',')}')">피드백 제출</button>`;
    body.appendChild(abar);

    // 이전 피드백 이력
    if (prevFbs.length) {
      const histDiv = document.createElement('div');
      histDiv.style.cssText = 'margin-top:14px;border-top:1px solid var(--border);padding-top:12px';
      histDiv.innerHTML = `<div style="font-size:12px;color:var(--muted);margin-bottom:8px">피드백 이력 (전체 ${prevFbs.length}건)</div>
        ${prevFbs.slice().reverse().map(fb => {
          const isMyFb = String(fb.author_id) === String(App.user.id);
          return `<div class="fb-entry" style="${isMyFb ? '' : 'background:var(--bg);border-left:3px solid var(--o200);padding-left:8px'}">
            <div class="fb-meta">
              <span class="bd ${isMyFb ? 'bd-approved' : 'bd-draft'}">${fb.author_name||''} ${isMyFb ? '(내 피드백)' : ''}</span>
              <span>${(fb.created_at||'').slice(0,10)}</span>
            </div>
            ${(fb.items||[]).map(it => {
              const g = goals.find(x => String(x.id) === String(it.goal_id));
              return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:2px 0">
                <span style="flex:1;color:var(--o800)">${g?.name||''}</span>
                ${it.score ? `<span style="color:var(--o500);font-weight:500">${'★'.repeat(it.score)}${'☆'.repeat(5-it.score)} ${it.score}점</span>` : ''}
                ${it.note ? `<span style="color:var(--muted)">— ${it.note}</span>` : ''}
              </div>`;
            }).join('')}
            ${fb.overall_note ? `<div style="font-size:12px;margin-top:4px;color:var(--muted);padding-top:4px;border-top:1px solid var(--o50)">${fb.overall_note}</div>` : ''}
          </div>`;
        }).join('')}`;
      body.appendChild(histDiv);
    }

    card.appendChild(body);
    el.appendChild(card);

    // 헤더 클릭으로 토글
    hd.addEventListener('click', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      toggleFbCard(ev.id, e);
    });

    // 별점 컴포넌트 (접힌 상태여도 미리 생성)
    goals.forEach(g => {
      const starWrap = document.getElementById(`fbs-${ev.id}-${g.id}`);
      if (starWrap) starWrap.appendChild(Stars(`${ev.id}-${g.id}`, 'fb'));
    });
  }
}

function toggleFbCard(evalId, e) {
  if (e) e.stopPropagation();
  const body = document.getElementById('fb-card-' + evalId);
  const btn  = document.getElementById('toggle-btn-' + evalId);
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? '접기 ▲' : '펼치기 ▼';
}

let _fbStarValues = {};
async function submitFeedback(evalId, goalIdsStr) {
  const goalIds = goalIdsStr.split(',');
  const items = goalIds.map(gid => {
    const starEl = document.querySelector(`[data-goal-id="${evalId}-${gid}"]`);
    const noteEl = document.getElementById(`fbn-${evalId}-${gid}`);
    return { goal_id: gid, score: parseInt(starEl?.dataset.value||0)||null, note: noteEl?.value||'' };
  }).filter(it => it.score || it.note?.trim());
  const overall = document.getElementById(`fbo-${evalId}`)?.value || '';
  if (!items.length && !overall.trim()) { showAlert('피드백 내용을 입력해주세요.', 'orange'); return; }
  try {
    await API.post(`/feedback/${evalId}`, { overall_note: overall, items });
    showAlert('피드백이 제출되었습니다!', 'teal');
    setTimeout(() => Pages.feedback(), 600);
  } catch(e) { showAlert(e.message, 'red'); }
}
