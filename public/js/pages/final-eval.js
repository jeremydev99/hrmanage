Pages.finalEval = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  const evs = await API.get('/evals');
  const myEv = evs.find(e => String(e.user_id) === String(App.user.id));

  // 내가 직속 상사인 직원의 final_mgr_pending 평가 (서버에서 직속 상사 여부 필터링)
  const mgrPending = await API.get('/evals/my-mgr-pending').catch(() => []);

  area.innerHTML = '';
  const tabs = [];
  if (myEv && ['approved','final_self','final_mgr_pending','final_done'].includes(myEv.phase))
    tabs.push({ id:'fin-self', label:'자기 최종평가' });
  if (mgrPending.length)
    tabs.push({ id:'fin-mgr', label:`상사 최종평가 (${mgrPending.length}건)` });
  if (!tabs.length) {
    area.innerHTML = '<div class="card"><div class="alert alert-orange">목표가 확정된 평가가 없습니다.</div></div>';
    return;
  }

  const tabsEl = document.createElement('div');
  tabsEl.className = 'stabs';
  tabsEl.innerHTML = tabs.map((t,i)=>
    `<button class="stb${i===0?' active':''}" id="stb-${t.id}" onclick="switchFinTab('${t.id}')">${t.label}</button>`
  ).join('');
  area.appendChild(tabsEl);
  tabs.forEach((t,i) => {
    const sp = document.createElement('div');
    sp.className='sp'+(i===0?' active':''); sp.id=t.id; area.appendChild(sp);
  });

  if (tabs.some(t=>t.id==='fin-self')) renderFinalSelf(myEv);
  if (tabs.some(t=>t.id==='fin-mgr')) renderFinalMgr(mgrPending);
};

function switchFinTab(id) {
  document.querySelectorAll('.stb').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.sp').forEach(s=>s.classList.remove('active'));
  document.getElementById('stb-'+id)?.classList.add('active');
  document.getElementById(id)?.classList.add('active');
}

async function renderFinalSelf(ev) {
  const el = document.getElementById('fin-self'); if(!el) return;
  const [goals, fe] = await Promise.all([
    API.get(`/evals/${ev.id}/goals`),
    API.get(`/final/${ev.id}`),
  ]);

  if (ev.phase === 'final_done') {
    // 결과 보기
    const scores = {};
    (fe?.scores||[]).forEach(s => scores[s.goal_id] = s);
    const totalW = goals.reduce((a,g)=>a+g.weight,0)||1;
    const sc = goals.reduce((a,g)=>a+((scores[g.id]?.mgr_score||0)/5*100)*(g.weight/totalW),0);
    const finalScore = Math.round(sc*10)/10;
    const autoGrade = finalScore>=90?'S':finalScore>=80?'A':finalScore>=70?'B':finalScore>=60?'C':'D';
    const displayGrade = fe?.selected_grade || fe?.final_grade || autoGrade;
    el.innerHTML = `<div class="card">
      <div class="card-header"><div><div class="card-header-t">최종 평가 완료</div><div class="card-header-s">${ev.period_label}</div></div>${gradeEl(displayGrade)}</div>
      <div style="text-align:center;margin:16px 0">
        <div style="font-size:36px;font-weight:700;color:var(--o500)">${finalScore}점</div>
        <div style="font-size:14px;color:var(--muted);margin-top:4px">최종 등급: ${gradeEl(displayGrade)}</div>
      </div>
      <div class="alert" style="background:#F1EFE8;color:#2C2C2A;border-color:#B4B2A9;font-size:12px;margin-bottom:14px">최종 평가는 잠금 처리되어 인사팀만 수정 가능합니다.</div>
      ${goals.map(g=>{
        const ms=(scores[g.id]?.mgr_score||0)/5*100;
        const ss=(scores[g.id]?.self_score||0)/5*100;
        return `<div class="bar-row"><div class="bar-label">
          <span style="font-weight:500">${g.name}</span>
          <div style="display:flex;gap:10px;font-size:12px">
            <span style="color:var(--muted)">자기: ${scoreLabel(scores[g.id]?.self_score)}</span>
            <span style="color:var(--o800);font-weight:500">상사: ${scoreLabel(scores[g.id]?.mgr_score)} (${Math.round(ms)}%)</span>
          </div>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(ms)}%"></div></div></div>`;
      }).join('')}
      ${fe?.mgr_note?`<div class="alert alert-purple" style="margin-top:12px;font-size:13px">상사 종합 의견: ${fe.mgr_note}</div>`:''}
    </div>`;
    return;
  }

  if (fe?.self_done) {
    const selfCard = document.createElement('div');
    selfCard.className = 'card';
    selfCard.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-header-t">자기 최종평가</div>
          <div class="card-header-s">제출 완료 — 수정 불가</div>
        </div>
        <span class="bd bd-locked">🔒 제출 완료</span>
      </div>
      <div class="alert alert-teal" style="font-size:12px">
        자기 최종평가가 제출되었습니다. 상사 최종평가를 기다리는 중입니다.
      </div>
      ${App.categories.map(cat => {
        const cg = goals.filter(g => String(g.category_id) === String(cat.id));
        if (!cg.length) return '';
        return `<div style="margin-bottom:12px">
          <div class="cat-title" style="background:${cat.color};color:${cat.text_color};display:inline-block;margin-bottom:8px">${cat.name}</div>
          ${cg.map(g => {
            const sc = (fe.scores||[]).find(s => String(s.goal_id) === String(g.id));
            const score = sc?.self_score || 0;
            const stars = '★'.repeat(score) + '☆'.repeat(5 - score);
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--o50);flex-wrap:wrap;gap:6px">
              <span style="font-size:13px;font-weight:500">${g.name}
                <span style="font-size:11px;color:var(--muted)">${g.weight}%</span>
              </span>
              <span style="color:var(--o500);font-size:16px;letter-spacing:2px">${stars}
                <span style="font-size:13px;font-weight:600;margin-left:4px">${score}점</span>
              </span>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
      ${fe.self_note ? `
      <div style="margin-top:12px;padding:12px;background:var(--o50);border-radius:8px;border:1px solid var(--o200)">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">자기 최종 의견</div>
        <div style="font-size:13px;line-height:1.7;white-space:pre-wrap;color:var(--o800)">${fe.self_note}</div>
      </div>` : ''}`;
    el.appendChild(selfCard);
    return;
  }

  // 자기 최종평가 입력 폼
  const existScores = {};
  (fe?.scores||[]).forEach(s => existScores[s.goal_id]=s.self_score);
  el.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-header"><div><div class="card-header-t">자기 최종평가</div><div class="card-header-s">평가 기간 전체 성과를 종합 평가하세요</div></div></div>
    <div class="alert alert-orange" style="font-size:12px">중간 피드백 내용을 참고하여 솔직하게 평가해 주세요.</div>
    ${App.categories.map(cat=>{
      const cg = goals.filter(g=>String(g.category_id)===String(cat.id));
      if(!cg.length) return '';
      return `<div style="margin-bottom:12px">
        <div class="cat-title" style="background:${cat.color};color:${cat.text_color};display:inline-block;margin-bottom:8px">${cat.name}</div>
        <div id="fin-self-cat-${cat.id}"></div>
      </div>`;
    }).join('')}
    <div style="margin-top:12px">
      <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">자기 최종 의견</label>
      <textarea id="fin-self-note" placeholder="전체 평가 기간의 성과와 소감을 작성하세요..." style="width:100%;min-height:100px;resize:vertical"></textarea>
    </div>
    <div class="abar"><button class="btn btn-purple" onclick="submitFinalSelf(${ev.id})">자기 최종평가 제출</button></div>`;
  el.appendChild(card);

  // 별점 렌더
  App.categories.forEach(cat => {
    const wrap = document.getElementById(`fin-self-cat-${cat.id}`); if(!wrap) return;
    goals.filter(g=>String(g.category_id)===String(cat.id)).forEach(g => {
      const row = document.createElement('div');
      row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--o50);flex-wrap:wrap;gap:6px';
      row.innerHTML=`<span style="font-size:13px;font-weight:500">${g.name} <span style="font-size:11px;color:var(--muted)">${g.weight}%</span></span>`;
      const starWrap = Stars(`fin-self-${g.id}`, 'final-self', existScores[g.id]||0);
      starWrap.dataset.goalId2 = g.id;
      row.appendChild(starWrap);
      wrap.appendChild(row);
    });
  });
}

async function submitFinalSelf(evalId) {
  const goals = await API.get(`/evals/${evalId}/goals`);
  const scores = [];
  let allScored = true;
  goals.forEach(g => {
    const starEl = document.querySelector(`[data-goal-id="fin-self-${g.id}"]`);
    const v = parseInt(starEl?.dataset.value||0);
    if (!v) allScored = false;
    scores.push({ goal_id: g.id, score: v });
  });
  if (!allScored) { showAlert('모든 목표에 점수를 입력해주세요.','orange'); return; }
  const note = document.getElementById('fin-self-note')?.value||'';
  try {
    await API.post(`/final/${evalId}/self`, { self_note: note, scores });
    showAlert('자기 최종평가 제출 완료!','teal');
    setTimeout(()=>Pages.finalEval(), 800);
  } catch(e) { showAlert(e.message,'red'); }
}

async function renderFinalMgr(mgrPending) {
  const el = document.getElementById('fin-mgr'); if(!el) return;
  el.innerHTML = '';

  // 안내 (여러 명일 때)
  if (mgrPending.length > 1) {
    const info = document.createElement('div');
    info.className = 'alert alert-orange';
    info.style.cssText = 'font-size:12px;margin-bottom:10px';
    info.textContent = `총 ${mgrPending.length}명의 최종평가가 대기 중입니다. 이름을 클릭하면 평가 내용이 펼쳐집니다.`;
    el.appendChild(info);
  }

  for (const ev of mgrPending) {
    const [goals, fe, fbs, grades] = await Promise.all([
      API.get(`/evals/${ev.id}/goals`),
      API.get(`/final/${ev.id}`),
      API.get(`/feedback/${ev.id}`),
      API.get('/grade-criteria').catch(() => []),
    ]);
    const selfScores = {};
    (fe?.scores||[]).forEach(s => selfScores[s.goal_id] = s.self_score);
    const myFbs    = fbs.filter(f => String(f.author_id) === String(App.user.id));
    const otherFbs = fbs.filter(f => String(f.author_id) !== String(App.user.id));

    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '8px';

    // ── 헤더 (항상 표시 — 이름 + 접기 버튼) ──────────────
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;gap:8px;flex-wrap:wrap';
    hdr.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        <div class="avatar" style="background:var(--o100);color:var(--o800);flex-shrink:0">${(ev.user_name||'?').slice(0,2)}</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--o800)">${ev.user_name||''}
            <span style="font-size:12px;color:var(--muted);font-weight:400"> · ${ev.dept||''} · ${ev.period_label||''}</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            자기평가 ${fe?.self_done ? '완료' : '미완료'} · 피드백 ${fbs.length}건
            ${ev.is_second ? '<span style="color:var(--o500);font-weight:500"> · 2차 평가자</span>' : ''}
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="bd bd-final" style="font-size:11px">최종평가 대기</span>
        <button class="btn btn-ghost btn-sm" id="fin-mgr-toggle-btn-${ev.id}"
          onclick="toggleFinMgrCard(${ev.id}, event)">펼치기 ▼</button>
      </div>`;
    hdr.addEventListener('click', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      toggleFinMgrCard(ev.id, e);
    });
    card.appendChild(hdr);

    // ── 접히는 본문 ────────────────────────────────────────
    const body = document.createElement('div');
    body.id = 'fin-mgr-body-' + ev.id;
    body.style.cssText = 'display:none;margin-top:14px;border-top:1px solid var(--o100);padding-top:14px';

    // ── 피드백 요약 + 접기/펼치기 ─────────────────────────
    if (fbs.length) {
      const fbSummary = document.createElement('div');
      fbSummary.style.cssText = 'background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:10px 12px;margin-bottom:12px';

      // 요약 헤더 행
      const fbHdr = document.createElement('div');
      fbHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer';
      fbHdr.innerHTML = `
        <div style="font-size:13px;font-weight:600;color:var(--o800)">
          📊 중간 피드백 참고
          <span style="font-size:12px;font-weight:400;color:var(--muted);margin-left:6px">
            내 피드백 ${myFbs.length}건 · 다른 승인자 ${otherFbs.length}건
          </span>
        </div>
        <button class="btn btn-ghost btn-sm" id="fin-fb-btn-${ev.id}" onclick="toggleFinFb(${ev.id}, event)">
          펼치기 ▼
        </button>`;
      fbSummary.appendChild(fbHdr);

      // 목표별 피드백 평균 별점 (요약 — 항상 표시)
      const scoreMap = {};
      fbs.forEach(fb => {
        (fb.items||[]).forEach(it => {
          if (!it.score) return;
          if (!scoreMap[it.goal_id]) scoreMap[it.goal_id] = [];
          scoreMap[it.goal_id].push(it.score);
        });
      });
      if (Object.keys(scoreMap).length) {
        const avgDiv = document.createElement('div');
        avgDiv.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid var(--o200)';
        goals.forEach(g => {
          const scores = scoreMap[g.id];
          if (!scores?.length) return;
          const avg = scores.reduce((a,b)=>a+b,0) / scores.length;
          const avgR = Math.round(avg);
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0;border-bottom:1px solid var(--o100)';
          row.innerHTML = `
            <span style="flex:1;font-weight:500;color:var(--o800)">${g.name}</span>
            <span style="color:var(--o400);letter-spacing:1px">${'★'.repeat(avgR)}${'☆'.repeat(5-avgR)}</span>
            <span style="color:var(--o600);font-weight:600">${avg.toFixed(1)}점</span>
            <span style="color:var(--muted)">(${scores.length}명)</span>`;
          avgDiv.appendChild(row);
        });
        fbSummary.appendChild(avgDiv);
      }

      // ── 접히는 상세 영역 ────────────────────────────────
      const fbDetail = document.createElement('div');
      fbDetail.id = 'fin-fb-detail-' + ev.id;
      fbDetail.style.display = 'none';

      // 내 피드백
      if (myFbs.length) {
        const mySection = document.createElement('div');
        mySection.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid var(--o200)';
        mySection.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--o700);margin-bottom:6px">✅ 내가 제공한 피드백</div>`;
        myFbs.forEach((fb, i) => {
          const entry = document.createElement('div');
          entry.style.cssText = 'background:var(--white);border:1px solid var(--o200);border-radius:6px;padding:8px;margin-bottom:6px';
          entry.innerHTML = `
            <div style="font-size:11px;color:var(--muted);margin-bottom:5px">${(fb.created_at||'').slice(0,16).replace('T',' ')}</div>
            ${(fb.items||[]).map(it => {
              const g = goals.find(x => String(x.id) === String(it.goal_id));
              return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:2px 0;border-bottom:1px solid var(--o50)">
                <span style="flex:1;font-weight:500">${g?.name||''}</span>
                ${it.score ? `<span style="color:var(--o500)">${'★'.repeat(it.score)}${'☆'.repeat(5-it.score)} ${it.score}점</span>` : ''}
                ${it.note ? `<span style="color:var(--muted)">— ${it.note}</span>` : ''}
              </div>`;
            }).join('')}
            ${fb.overall_note ? `<div style="font-size:12px;color:var(--o800);margin-top:5px;padding-top:5px;border-top:1px solid var(--o100)">${fb.overall_note}</div>` : ''}`;
          mySection.appendChild(entry);
        });
        fbDetail.appendChild(mySection);
      }

      // 다른 승인자 피드백
      if (otherFbs.length) {
        const otherSection = document.createElement('div');
        otherSection.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid var(--o200)';
        otherSection.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--o700);margin-bottom:6px">👥 다른 승인자 피드백</div>`;
        otherFbs.forEach(fb => {
          const entry = document.createElement('div');
          entry.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-left:3px solid var(--o300);border-radius:6px;padding:8px;margin-bottom:6px';
          entry.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              <span style="font-size:12px;font-weight:600;color:var(--o800)">${fb.author_name||''}</span>
              <span style="font-size:11px;color:var(--muted)">${(fb.created_at||'').slice(0,10)}</span>
            </div>
            ${(fb.items||[]).map(it => {
              const g = goals.find(x => String(x.id) === String(it.goal_id));
              return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:2px 0;border-bottom:1px solid var(--o50)">
                <span style="flex:1;font-weight:500">${g?.name||''}</span>
                ${it.score ? `<span style="color:var(--o500)">${'★'.repeat(it.score)}${'☆'.repeat(5-it.score)} ${it.score}점</span>` : ''}
                ${it.note ? `<span style="color:var(--muted)">— ${it.note}</span>` : ''}
              </div>`;
            }).join('')}
            ${fb.overall_note ? `<div style="font-size:12px;color:var(--o800);margin-top:5px;padding-top:5px;border-top:1px solid var(--o100)">${fb.overall_note}</div>` : ''}`;
          otherSection.appendChild(entry);
        });
        fbDetail.appendChild(otherSection);
      }

      fbSummary.appendChild(fbDetail);
      body.appendChild(fbSummary);
    }

    // ── 1차 평가 이미 완료된 경우 — 잠금 상태 표시 ──────────
    if (fe?.mgr_done && !ev.is_second) {
      const doneDiv = document.createElement('div');
      doneDiv.style.cssText = 'margin-top:14px;border-top:1px solid var(--o100);padding-top:14px';
      doneDiv.innerHTML = `
        <div class="alert" style="background:#F1EFE8;color:#2C2C2A;border-color:#B4B2A9;font-size:13px;margin-bottom:12px">
          🔒 최종평가가 완료되었습니다.
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          ${fe.final_score != null
            ? `<span style="font-size:24px;font-weight:700;color:var(--o500)">${fe.final_score}점</span>
               <span class="bd bd-locked" style="font-size:14px">${fe.selected_grade||fe.final_grade||''}</span>`
            : ''}
        </div>
        ${goals.map(g => {
          const sc = (fe.scores||[]).find(s => String(s.goal_id) === String(g.id));
          const ms = sc?.mgr_score || 0;
          const ss = sc?.self_score || 0;
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--o50);font-size:13px;flex-wrap:wrap">
            <span style="flex:1;font-weight:500">${g.name}</span>
            ${ss ? `<span style="color:var(--muted)">자기 ${'★'.repeat(ss)}${'☆'.repeat(5-ss)}</span>` : ''}
            ${ms ? `<span style="color:var(--o500)">상사 ${'★'.repeat(ms)}${'☆'.repeat(5-ms)} ${ms}점</span>` : ''}
          </div>`;
        }).join('')}
        ${fe.mgr_note
          ? `<div style="margin-top:10px;padding:10px;background:var(--o50);border-radius:8px;font-size:13px;line-height:1.7">${fe.mgr_note}</div>`
          : ''}`;
      body.appendChild(doneDiv);
      card.appendChild(body);
      el.appendChild(card);
      continue;
    }

    // ── 2차 평가 이미 완료된 경우 ─────────────────────────
    if (fe?.second_mgr_done && ev.is_second) {
      const doneDiv2 = document.createElement('div');
      doneDiv2.style.cssText = 'margin-top:14px;border-top:1px solid var(--o100);padding-top:14px';
      doneDiv2.innerHTML = `
        <div class="alert alert-teal" style="font-size:13px">
          ✅ 2차 최종평가가 완료되었습니다.
        </div>
        ${fe.second_mgr_note
          ? `<div style="margin-top:8px;padding:10px;background:var(--o50);border-radius:8px;font-size:13px">${fe.second_mgr_note}</div>`
          : ''}`;
      body.appendChild(doneDiv2);
      card.appendChild(body);
      el.appendChild(card);
      continue;
    }

    // ── 직원 자기 의견 ────────────────────────────────────
    if (fe?.self_note) {
      const selfNote = document.createElement('div');
      selfNote.className = 'alert alert-orange';
      selfNote.style.cssText = 'font-size:12px;margin-bottom:10px';
      selfNote.innerHTML = `<strong>직원 자기 의견:</strong> ${fe.self_note}`;
      body.appendChild(selfNote);
    }

    // ── 목표별 평가 입력 (1차 평가자만) ─────────────────────
    if (!ev.is_second) {
      const goalsSection = document.createElement('div');
      goalsSection.innerHTML = App.categories.map(cat => {
        const cg = goals.filter(g => String(g.category_id) === String(cat.id));
        if (!cg.length) return '';
        return `<div style="margin-bottom:12px">
          <div class="cat-title" style="background:${cat.color};color:${cat.text_color};display:inline-block;margin-bottom:8px">${cat.name}</div>
          <div id="fin-mgr-cat-${ev.id}-${cat.id}"></div>
        </div>`;
      }).join('');
      body.appendChild(goalsSection);
    }

    // 종합 의견 + 제출
    const bottomSection = document.createElement('div');
    bottomSection.innerHTML = `
      ${!ev.is_second && grades.length ? `
      <div style="margin-top:12px">
        <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">
          최종 등급 선택 <span style="color:var(--red)">*</span>
        </label>
        <select id="fin-grade-sel-${ev.id}" style="width:100%;height:38px;font-size:13px;margin-bottom:6px">
          <option value="">— 등급을 선택하세요 —</option>
          ${grades.map(g =>
            `<option value="${g.grade_code}">${g.grade_name}${g.note ? ' (' + g.note + ')' : ''}</option>`
          ).join('')}
        </select>
        <div id="fin-grade-desc-${ev.id}"
          style="font-size:12px;color:var(--muted);padding:6px 10px;background:var(--o50);border-radius:6px;display:none;margin-bottom:10px">
        </div>
      </div>` : ''}
      <div style="margin-top:12px">
        <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">상사 종합 의견</label>
        <textarea id="fin-mgr-note-${ev.id}" placeholder="성과 총평 및 향후 육성 방향을 작성하세요..."
          style="width:100%;min-height:80px;resize:vertical"></textarea>
      </div>
      <div class="abar">
        <button class="btn btn-purple" onclick="submitFinalMgr(${ev.id},${ev.is_second||0})">${ev.is_second?'2차 최종평가 제출':'최종 평가 확정 — 잠금 처리됩니다'}</button>
      </div>`;
    body.appendChild(bottomSection);

    // 등급 선택 시 설명 표시
    setTimeout(() => {
      const sel    = document.getElementById('fin-grade-sel-' + ev.id);
      const descEl = document.getElementById('fin-grade-desc-' + ev.id);
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
    card.appendChild(body);
    el.appendChild(card);

    // 별점 렌더 — 1차 평가자만 (2차는 별점 입력 없음)
    if (!ev.is_second) {
      App.categories.forEach(cat => {
        const wrap = document.getElementById(`fin-mgr-cat-${ev.id}-${cat.id}`); if(!wrap) return;
        goals.filter(g => String(g.category_id) === String(cat.id)).forEach(g => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--o50);flex-wrap:wrap;gap:6px';
          const selfLbl = selfScores[g.id]
            ? `<span style="font-size:11px;background:var(--o100);color:var(--o800);padding:1px 7px;border-radius:10px">자기: ${scoreLabel(selfScores[g.id])}</span>`
            : '';
          row.innerHTML = `<span style="font-size:13px;font-weight:500">${g.name} <span style="font-size:11px;color:var(--muted)">${g.weight}%</span> ${selfLbl}</span>`;
          const starWrap = Stars(`fin-mgr-${ev.id}-${g.id}`, 'final-mgr');
          starWrap.dataset.goalId2 = g.id;
          starWrap.dataset.evalId  = ev.id;
          row.appendChild(starWrap);
          wrap.appendChild(row);
        });
      });
    }
  }
}

function toggleFinMgrCard(evalId, e) {
  if (e) e.stopPropagation();
  const body = document.getElementById('fin-mgr-body-' + evalId);
  const btn  = document.getElementById('fin-mgr-toggle-btn-' + evalId);
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? '접기 ▲' : '펼치기 ▼';
}

function toggleFinFb(evalId, e) {
  if (e) e.stopPropagation();
  const detail = document.getElementById('fin-fb-detail-' + evalId);
  const btn    = document.getElementById('fin-fb-btn-'    + evalId);
  if (!detail) return;
  const isHidden = detail.style.display === 'none';
  detail.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? '접기 ▲' : '펼치기 ▼';
}

async function submitFinalMgr(evalId, isSecond) {
  const confirmMsg = isSecond
    ? '2차 최종평가를 제출하시겠습니까? 제출 후 최종 잠금됩니다.'
    : '최종 평가를 확정하면 잠금 처리되어 인사팀 외에는 수정할 수 없습니다. 계속하시겠습니까?';
  if (!confirm(confirmMsg)) return;

  const note = document.getElementById(`fin-mgr-note-${evalId}`)?.value || '';

  // 2차 평가자는 별점 입력 없이 의견만
  if (isSecond) {
    try {
      await API.post(`/final/${evalId}/mgr`, { mgr_note: note, scores: [], is_second: true });
      showAlert('2차 최종평가가 제출되었습니다.', 'green');
      setTimeout(() => Pages.finalEval(), 1000);
    } catch(e) { showAlert(e.message, 'red'); }
    return;
  }

  // 1차 평가자 — 등급 선택 + 별점 필수
  const selectedGrade = document.getElementById(`fin-grade-sel-${evalId}`)?.value || '';
  const gradeSelEl = document.getElementById(`fin-grade-sel-${evalId}`);
  if (gradeSelEl && !selectedGrade) {
    showAlert('최종 등급을 선택해주세요.', 'orange');
    return;
  }

  const goals = await API.get(`/evals/${evalId}/goals`);
  const scores = []; let allScored = true;
  goals.forEach(g => {
    const starEl = document.querySelector(`[data-goal-id="fin-mgr-${evalId}-${g.id}"]`);
    const v = parseInt(starEl?.dataset.value || 0);
    if (!v) allScored = false;
    scores.push({ goal_id: g.id, score: v });
  });
  if (!allScored) { showAlert('모든 목표에 점수를 입력해주세요.', 'orange'); return; }
  try {
    const res = await API.post(`/final/${evalId}/mgr`, { mgr_note: note, scores, selected_grade: selectedGrade });
    showAlert(`최종 평가 확정! 점수: ${res.final_score}점 / 등급: ${res.grade}`, 'green');
    setTimeout(() => Pages.finalEval(), 1000);
  } catch(e){showAlert(e.message,'red');}
}
