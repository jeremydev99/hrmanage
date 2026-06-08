/* ── 공통 컴포넌트 ── */

function el(tag, attrs={}, ...children) {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === 'cls') e.className = v;
    else if (k.startsWith('on')) e[k] = v;
    else e.setAttribute(k, v);
  }
  children.flat().forEach(c => e.append(typeof c === 'string' ? c : c));
  return e;
}

function html(str) {
  const d = document.createElement('div');
  d.innerHTML = str;
  return d.firstElementChild;
}

let _alertTimer;
function showAlert(msg, type='orange', container='#main-alert') {
  const c = document.querySelector(container);
  if (!c) return;
  c.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  clearTimeout(_alertTimer);
  _alertTimer = setTimeout(() => { if(c) c.innerHTML = ''; }, 3500);
}

function badge(text, cls) {
  return `<span class="bd bd-${cls}">${text}</span>`;
}

function phaseBadge(phase) {
  const map = {
    draft:              ['작성중',        'draft'],
    pending:            ['승인 대기',     'pending'],
    approved:           ['목표 확정',     'approved'],
    final_self:         ['자기평가 중',   'fb'],
    final_mgr_pending:  ['상사평가 대기', 'final'],
    final_mgr2_pending: ['2차 평가 대기', 'purple'],
    final_done:         ['평가 완료',     'locked'],
  };
  const [t,c] = map[phase]||[phase,'draft'];
  return badge(t, c);
}

function roleBadge(role) {
  const map={master:['마스터관리자','master'],admin:['일반관리자','admin'],user:['일반사용자','user']};
  const [t,c]=map[role]||[role,'user'];
  return badge(t,c);
}

function scoreLabel(s) {
  return s ? ['미달성','미흡','보통','우수','탁월'][s-1] : '-';
}

function gradeEl(g) {
  return `<span class="grade grade-${g}">${g}</span>`;
}

function Stars(goalId, ctx, initial=0, onChange=null) {
  const wrap = document.createElement('div');
  wrap.className = 'stars';
  wrap.dataset.goalId = goalId;
  wrap.dataset.ctx = ctx;
  let current = initial;
  const lbl = document.createElement('span');
  lbl.className = 'star-lbl';
  lbl.textContent = scoreLabel(current);
  for (let i=1;i<=5;i++) {
    const s = document.createElement('span');
    s.className = 'star' + (current>=i?' on':'');
    s.textContent = '★';
    s.dataset.val = i;
    s.onclick = () => {
      current = parseInt(s.dataset.val);
      wrap.querySelectorAll('.star').forEach((x,j) => x.classList.toggle('on', j<current));
      lbl.textContent = scoreLabel(current);
      wrap.dataset.value = current;
      if (onChange) onChange(current);
    };
    wrap.appendChild(s);
  }
  wrap.dataset.value = initial;
  wrap.appendChild(lbl);
  return wrap;
}

function flowBar(phase) {
  // phase별 완료된 단계 수
  const doneCount = {
    draft:               1,
    pending:             1,
    approved:            2,
    rejected:            2,
    final_self:          3,
    final_mgr_pending:   3,
    final_mgr2_pending:  3,
    final_done:          5,
  }[phase] || 0;

  const labels = ['목표\n작성', '목표\n승인', '중간\n피드백', '최종\n평가', '완료'];
  const wrap = document.createElement('div');
  wrap.className = 'flow';

  labels.forEach((label, i) => {
    const stepNum = i + 1;
    const done = stepNum <= doneCount;
    const step = document.createElement('div');
    step.className = 'fstep';
    step.innerHTML = `
      <div style="
        width:28px;height:28px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:600;
        ${done
          ? 'background:var(--o500);color:#fff;border:2px solid var(--o500)'
          : 'background:#fff;color:#aaa;border:2px solid #ddd'}
      ">${done ? '✓' : stepNum}</div>
      <div class="flabel">${label}</div>`;
    wrap.appendChild(step);
    if (i < labels.length - 1) {
      const arr = document.createElement('div');
      arr.className = 'farrow';
      wrap.appendChild(arr);
    }
  });
  return wrap;
}

function subPeriodHtml(period, selected) {
  const opts = period==='q'
    ? ['1분기(1~3월)','2분기(4~6월)','3분기(7~9월)','4분기(10~12월)']
    : ['상반기(1~6월)','하반기(7~12월)'];
  return opts.map((l,i)=>
    `<span class="spopt${selected===String(i+1)?' sel':''}" data-v="${i+1}">${l}</span>`
  ).join('');
}

function getPeriodLabel(period, subP, year) {
  if (period==='q') return `${year} ${['1분기','2분기','3분기','4분기'][parseInt(subP)-1]}`;
  return `${year} ${subP==='1'?'상반기':'하반기'}`;
}

// 카테고리 가중치를 반영한 최종 점수 계산
// scores: { goalId: { mgr_score, self_score } }
function calcFinalScore(goals, scores) {
  const catMap = {};
  goals.forEach(g => {
    if (!catMap[g.category_id]) catMap[g.category_id] = [];
    catMap[g.category_id].push(g);
  });
  let total = 0;
  for (const [catId, cg] of Object.entries(catMap)) {
    const cat = App.categories.find(c => String(c.id) === String(catId));
    const catWeight = cat?.weight ?? 0;
    const catTotalW = cg.reduce((a, g) => a + g.weight, 0) || 1;
    const catScore = cg.reduce((a, g) => {
      const s = scores[g.id]?.mgr_score || 0;
      return a + (s / 5 * 100) * (g.weight / catTotalW);
    }, 0);
    total += catScore * (catWeight / 100);
  }
  return Math.round(total * 10) / 10;
}

function renderGoalsSummary(goals, categories) {
  if (!goals?.length) return '<div class="alert alert-orange">목표 항목이 없습니다.</div>';
  const byCat = {};
  goals.forEach(g => {
    if (!byCat[g.category_id]) byCat[g.category_id] = [];
    byCat[g.category_id].push(g);
  });
  return categories.map(cat => {
    const cg = byCat[cat.id] || [];
    if (!cg.length) return '';
    return `<div style="margin-bottom:10px">
      <span class="cat-title" style="background:${cat.color};color:${cat.text_color};display:inline-block;margin-bottom:6px">${cat.name} (가중치 ${cat.weight}%)</span>
      ${cg.map((g,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--o50)">
        <span style="font-size:11px;color:var(--muted);min-width:16px">${i+1}</span>
        <span style="flex:1;font-size:13px;font-weight:500">${g.name}</span>
        <span style="font-size:12px;color:var(--muted)">${g.kpi||'-'}</span>
        <span style="font-size:11px;background:var(--o100);color:var(--o800);padding:1px 7px;border-radius:10px;font-weight:500">${g.weight}%</span>
      </div>`).join('')}
    </div>`;
  }).join('');
}
