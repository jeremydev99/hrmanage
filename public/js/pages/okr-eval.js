console.log('okr-eval.js 실행됨');
Pages.okrEval = async function(periodLabel, evalYear, mode) {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const allCycles = await API.get('/okr').catch(() => []);
    // 기간 파라미터가 있으면 해당 기간 OKR만 표시
    const cycles = periodLabel
      ? allCycles.filter(c => c.period_label === periodLabel && String(c.eval_year) === String(evalYear))
      : allCycles;
    area.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px';
    if (periodLabel) {
      header.innerHTML = `
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--o800)">
            🎯 ${mode || 'OKR'} 목표 설정
          </div>
          <div style="font-size:12px;color:var(--muted)">
            ${periodLabel} · ${evalYear}
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="Pages.myEval()">← 내 평가</button>
          <button class="btn btn-primary" onclick="startNewOKR('${periodLabel}','${evalYear}')">
            + 새 ${mode || 'OKR'} 작성
          </button>
        </div>`;
    } else {
      header.innerHTML = `
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--o800)">🎯 OKR 목표 설정</div>
          <div style="font-size:12px;color:var(--muted)">Objectives and Key Results</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="Pages.myEval()">← 내 평가</button>
          <button class="btn btn-primary" onclick="startNewOKR()">+ 새 OKR 작성</button>
        </div>`;
    }
    area.appendChild(header);

    if (!cycles.length) {
      // 기간 지정 진입(내 평가 탭 버튼)이면 바로 작성 폼으로
      if (periodLabel) {
        startNewOKR(periodLabel, evalYear);
        return;
      }
      const empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML = `<div class="alert alert-orange">작성된 OKR이 없습니다.
        <button class="btn btn-ghost btn-sm" style="margin-left:8px"
          onclick="startNewOKR()">지금 작성하기 →</button>
      </div>`;
      area.appendChild(empty);
      return;
    }

    cycles.forEach(cycle => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '12px';

      let totalKRs = 0, totalPct = 0;
      cycle.objectives.forEach(obj =>
        obj.key_results.forEach(kr => {
          totalKRs++;
          totalPct += kr.target_value > 0 ? (kr.current_value / kr.target_value) * 100 : 0;
        })
      );
      const avg = totalKRs > 0 ? Math.round(totalPct / totalKRs) : 0;
      const col = avg >= 70 ? 'var(--green)' : avg >= 40 ? 'var(--o500)' : '#E53935';

      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:15px;font-weight:600">${cycle.period_label}</div>
            <div style="font-size:12px;color:var(--muted)">${cycle.eval_year} · OKR</div>
          </div>
          <div style="display:flex;align-items:center;gap:14px">
            ${cycle.grade ? `
            <div style="text-align:center">
              <span class="bd bd-locked" style="font-size:14px">${cycle.grade}</span>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">OKR 등급</div>
            </div>` : ''}
            <div style="text-align:center">
              <div style="font-size:28px;font-weight:800;color:${col}">${avg}%</div>
              <div style="font-size:11px;color:var(--muted)">전체 달성률</div>
            </div>
            <button class="btn btn-ghost btn-sm"
              onclick="updateOKRProgress(${cycle.id})">진행률 업데이트</button>
          </div>
        </div>
        ${cycle.grade && cycle.grade_comment ? `
        <div style="margin-bottom:10px;padding:8px 12px;background:var(--o50);border-radius:6px;font-size:12px;color:var(--o700)">
          <strong>평가 의견:</strong> ${cycle.grade_comment}
        </div>` : ''}
        <div style="background:var(--o100);border-radius:20px;height:10px;margin-bottom:16px">
          <div style="background:${col};border-radius:20px;height:100%;
                      width:${Math.min(avg,100)}%;transition:width .4s"></div>
        </div>
        ${cycle.objectives.map((obj, oi) => {
          const op = obj.key_results.length
            ? Math.round(obj.key_results.reduce((a,kr) =>
                a + (kr.target_value>0?(kr.current_value/kr.target_value)*100:0),0)
                / obj.key_results.length) : 0;
          const oc = op>=70?'var(--green)':op>=40?'var(--o500)':'#E53935';
          return `<div style="border:1px solid var(--border);border-radius:8px;
                               padding:12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="font-size:13px;font-weight:600;color:var(--o800)">
                🎯 O${oi+1}. ${obj.title}
              </div>
              <span style="font-size:14px;font-weight:700;color:${oc}">${op}%</span>
            </div>
            ${obj.description?`<div style="font-size:12px;color:var(--muted);margin-bottom:8px">${obj.description}</div>`:''}
            ${obj.key_results.map((kr,ki) => {
              const kp = kr.target_value>0?Math.round((kr.current_value/kr.target_value)*100):0;
              const kc = kp>=70?'var(--green)':kp>=40?'var(--o500)':'#E53935';
              return `<div style="display:flex;align-items:center;gap:8px;
                                  padding:5px 0;font-size:12px;border-top:1px solid var(--o50)">
                <span style="color:var(--muted);white-space:nowrap">KR${ki+1}</span>
                <span style="flex:1;color:var(--o700)">${kr.title}</span>
                <span style="color:var(--muted);white-space:nowrap">
                  ${kr.current_value}/${kr.target_value}${kr.unit}
                </span>
                <div style="width:80px;background:var(--o100);border-radius:10px;height:6px;flex-shrink:0">
                  <div style="background:${kc};border-radius:10px;height:100%;
                              width:${Math.min(kp,100)}%"></div>
                </div>
                <span style="font-weight:700;color:${kc};width:36px;text-align:right">${kp}%</span>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}`;
      area.appendChild(card);
    });
  } catch(err) {
    area.innerHTML = `<div class="alert alert-red">오류: ${err.message}</div>`;
  }
};

let _okrObjCount = 0, _okrKRCount = {};
let _currentPeriodLabel = null, _currentEvalYear = null;

function startNewOKR(periodLabel, evalYear) {
  // 기간이 전달된 경우 바로 폼 표시
  if (periodLabel && evalYear) {
    _currentPeriodLabel = periodLabel;
    _currentEvalYear = evalYear;
    renderOKRForm(periodLabel, evalYear);
    return;
  }

  // 기간이 없으면 활성 기간 선택 화면 표시
  API.get('/eval-periods/active').then(periods => {
    if (!periods || !periods.length) {
      showAlert('활성화된 평가 기간이 없습니다.', 'red');
      return;
    }
    // 활성 기간이 1개면 바로 폼으로
    if (periods.length === 1) {
      _currentPeriodLabel = periods[0].period_label;
      _currentEvalYear = periods[0].eval_year;
      renderOKRForm(periods[0].period_label, periods[0].eval_year);
      return;
    }
    // 여러 개면 선택 화면 표시
    const area = document.getElementById('main-area');
    area.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-header-t">🎯 OKR 작성 기간 선택</div>
          <div class="card-header-s">작성할 평가 기간을 선택하세요</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${periods.map(p => {
          const typeLabel = p.period_type === 'half' ? '반기'
            : p.period_type === 'quarter' ? '분기'
            : p.period_type === 'h' ? '반기'
            : p.period_type === 'q' ? '분기'
            : (p.period_type || '');
          return `
          <button class="btn btn-ghost"
            style="text-align:left;padding:14px 16px;border:1px solid var(--border);
                   border-radius:8px;font-size:14px"
            onclick="startNewOKR('${p.period_label}','${p.eval_year}')">
            <div style="font-weight:600;color:var(--o800)">${p.period_label}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">
              ${p.eval_year} · ${typeLabel}
              ${p.eval_mode && p.eval_mode !== 'MBO'
                ? `<span class="bd bd-teal" style="font-size:10px;margin-left:4px">${p.eval_mode}</span>`
                : ''}
            </div>
          </button>`;}).join('')}
      </div>
      <div class="abar" style="margin-top:12px">
        <button class="btn btn-ghost" onclick="Pages.okrDashboard()">취소</button>
      </div>`;
    area.appendChild(card);
  }).catch(() => showAlert('평가 기간을 불러올 수 없습니다.', 'red'));
}

function renderOKRForm(periodLabel, evalYear) {
  _okrObjCount = 0; _okrKRCount = {};
  const area = document.getElementById('main-area');
  area.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-header-t">🎯 OKR 작성 — ${periodLabel}</div>
        <div class="card-header-s">Objective(목표)와 Key Results(핵심 결과)를 설정하세요</div>
      </div>
    </div>
    <div class="alert alert-teal" style="font-size:12px;margin-bottom:14px">
      <strong>작성 가이드:</strong> Objective는 도전적이고 정성적인 목표,
      Key Result는 측정 가능한 수치로 작성하세요. KR 달성률 70%를 성공으로 봅니다.
    </div>
    <div id="okr-objectives-area"></div>
    <button class="btn btn-ghost" style="width:100%;margin-top:8px;border:1px dashed var(--o300)"
      onclick="addOKRObjective()">+ Objective 추가</button>
    <div class="abar" style="margin-top:16px">
      <button class="btn btn-ghost"
        onclick="Pages.okrEval('${periodLabel}','${evalYear}')">취소</button>
      <button class="btn btn-primary" onclick="submitOKR()">OKR 저장</button>
    </div>`;
  area.appendChild(card);
  addOKRObjective();
}

function addOKRObjective() {
  const area = document.getElementById('okr-objectives-area');
  const idx = _okrObjCount++;
  const div = document.createElement('div');
  div.id = `okr-obj-${idx}`;
  div.style.cssText = 'border:1px solid var(--o200);border-radius:8px;padding:14px;margin-bottom:10px;background:var(--o50)';
  div.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:14px;font-weight:600;color:var(--o800)">🎯 Objective ${idx+1}</span>
      <button class="btn btn-sm" style="background:none;border:1px solid #F09595;
              color:#A32D2D;padding:3px 8px;font-size:11px"
        onclick="document.getElementById('okr-obj-${idx}').remove()">삭제</button>
    </div>
    <input id="okr-obj-title-${idx}"
      placeholder="목표를 입력하세요 (예: 글로벌 시장 진출 기반 마련)"
      style="width:100%;margin-bottom:6px;height:36px;font-size:13px">
    <input id="okr-obj-desc-${idx}"
      placeholder="목표 배경 설명 (선택사항)"
      style="width:100%;margin-bottom:10px;height:32px;font-size:12px">
    <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:500">
      Key Results — 측정 가능한 수치로 입력하세요 (기본 3개)
    </div>
    <div id="okr-krs-${idx}"></div>
    <button class="btn btn-ghost btn-sm" style="font-size:11px;margin-top:6px"
      onclick="addOKRKeyResult(${idx})">+ Key Result 추가</button>`;
  area.appendChild(div);
  addOKRKeyResult(idx);
  addOKRKeyResult(idx);
  addOKRKeyResult(idx);
}

function addOKRKeyResult(objIdx) {
  if (!_okrKRCount[objIdx]) _okrKRCount[objIdx] = 0;
  const ki = _okrKRCount[objIdx]++;
  const area = document.getElementById(`okr-krs-${objIdx}`);
  if (!area) return;
  const div = document.createElement('div');
  div.id = `okr-kr-${objIdx}-${ki}`;
  div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap';
  div.innerHTML = `
    <span style="font-size:11px;color:var(--muted);white-space:nowrap;min-width:28px">KR${ki+1}</span>
    <input id="okr-kr-title-${objIdx}-${ki}"
      placeholder="핵심 결과 (예: 미국 파트너사 3개 계약 완료)"
      style="flex:3;min-width:160px;height:32px;font-size:12px">
    <input id="okr-kr-target-${objIdx}-${ki}" type="number" value="100"
      placeholder="목표치" title="달성하고자 하는 목표 수치를 입력하세요"
      style="width:70px;height:32px;font-size:12px;text-align:center">
    <select id="okr-kr-unit-sel-${objIdx}-${ki}"
      style="width:60px;height:32px;font-size:12px"
      onchange="toggleCustomUnit('${objIdx}','${ki}',this.value)">
      <option value="%">%</option>
      <option value="개">개</option>
      <option value="억">억</option>
      <option value="명">명</option>
      <option value="건">건</option>
      <option value="회">회</option>
      <option value="__custom__">직접입력</option>
    </select>
    <input id="okr-kr-unit-${objIdx}-${ki}" type="hidden" value="%">
    <input id="okr-kr-unit-custom-${objIdx}-${ki}"
      placeholder="단위"
      style="width:54px;height:32px;font-size:12px;display:none"
      oninput="document.getElementById('okr-kr-unit-${objIdx}-${ki}').value=this.value">
    <button class="btn btn-sm"
      style="background:none;border:none;color:var(--muted);padding:2px 6px"
      onclick="document.getElementById('okr-kr-${objIdx}-${ki}').remove()">✕</button>`;
  area.appendChild(div);
}

function toggleCustomUnit(objIdx, ki, val) {
  const hidden = document.getElementById(`okr-kr-unit-${objIdx}-${ki}`);
  const custom = document.getElementById(`okr-kr-unit-custom-${objIdx}-${ki}`);
  if (val === '__custom__') {
    custom.style.display = 'block';
    custom.focus();
    if (hidden) hidden.value = '';
  } else {
    if (custom) custom.style.display = 'none';
    if (hidden) hidden.value = val;
  }
}

async function submitOKR() {
  const objArea = document.getElementById('okr-objectives-area');
  if (!objArea) return;
  const objectives = [];
  let valid = true;

  [...objArea.querySelectorAll('[id^="okr-obj-"]')].forEach(objDiv => {
    const idx = objDiv.id.replace('okr-obj-','');
    const title = document.getElementById(`okr-obj-title-${idx}`)?.value.trim();
    if (!title) { valid = false; return; }
    const krArea = document.getElementById(`okr-krs-${idx}`);
    const key_results = [];
    [...(krArea?.querySelectorAll(`[id^="okr-kr-${idx}-"]`)||[])].forEach(krDiv => {
      const ki = krDiv.id.split('-').pop();
      const t = document.getElementById(`okr-kr-title-${idx}-${ki}`)?.value.trim();
      if (!t) return;
      key_results.push({
        title: t,
        target_value: parseFloat(document.getElementById(`okr-kr-target-${idx}-${ki}`)?.value||'100'),
        unit: document.getElementById(`okr-kr-unit-${idx}-${ki}`)?.value||'%',
      });
    });
    if (!key_results.length) { valid = false; return; }
    objectives.push({ title, description: document.getElementById(`okr-obj-desc-${idx}`)?.value.trim()||'', key_results });
  });

  if (!valid || !objectives.length) {
    showAlert('Objective와 Key Result를 각각 1개 이상 입력해주세요.', 'orange');
    return;
  }
  try {
    let label = _currentPeriodLabel;
    let year  = _currentEvalYear;
    if (!label) {
      const periods = await API.get('/eval-periods/active').catch(() => []);
      const period = periods[0];
      if (!period) { showAlert('활성화된 평가 기간이 없습니다.', 'red'); return; }
      label = period.period_label;
      year  = period.eval_year;
    }
    await API.post('/okr', { period_label: label, eval_year: year, objectives });
    showAlert('OKR이 저장되었습니다!', 'green');
    setTimeout(() => Pages.okrEval(_currentPeriodLabel, _currentEvalYear), 600);
  } catch(e) { showAlert(e.message, 'red'); }
}

async function updateOKRProgress(cycleId) {
  const cycles = await API.get('/okr').catch(() => []);
  const cycle = cycles.find(c => c.id === cycleId);
  if (!cycle) return;
  const area = document.getElementById('main-area');
  area.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const allKRs = cycle.objectives.flatMap(o => o.key_results);
  card.innerHTML = `
    <div class="card-header"><div>
      <div class="card-header-t">진행률 업데이트</div>
      <div class="card-header-s">${cycle.period_label} OKR 현재 달성 현황 입력</div>
    </div></div>
    ${cycle.objectives.map((obj,oi) => `
      <div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:600;color:var(--o800);margin-bottom:8px">
          🎯 O${oi+1}. ${obj.title}
        </div>
        ${obj.key_results.map((kr,ki) => `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;
                      border-bottom:1px solid var(--o50);flex-wrap:wrap">
            <span style="flex:1;font-size:12px;color:var(--o700)">KR${ki+1}. ${kr.title}</span>
            <div style="display:flex;align-items:center;gap:6px">
              <input id="kr-prog-${kr.id}" type="number"
                value="${kr.current_value}" min="0" max="${kr.target_value}"
                style="width:80px;height:32px;font-size:13px;text-align:center">
              <span style="font-size:13px;color:var(--muted)">/ ${kr.target_value}${kr.unit}</span>
            </div>
          </div>`).join('')}
      </div>`).join('')}
    <div class="abar">
      <button class="btn btn-ghost" onclick="Pages.okrEval()">취소</button>
      <button class="btn btn-primary" onclick="saveOKRProgress(${cycleId})">저장</button>
    </div>`;
  area.appendChild(card);
  window._currentOKRKRs = allKRs;
}

async function saveOKRProgress(cycleId) {
  const kr_updates = (window._currentOKRKRs||[]).map(kr => ({
    kr_id: kr.id,
    current_value: parseFloat(document.getElementById(`kr-prog-${kr.id}`)?.value||'0'),
  }));
  try {
    await API.post(`/okr/${cycleId}/progress`, { kr_updates });
    showAlert('진행률이 업데이트되었습니다!', 'green');
    setTimeout(() => Pages.okrEval(), 600);
  } catch(e) { showAlert(e.message, 'red'); }
}
