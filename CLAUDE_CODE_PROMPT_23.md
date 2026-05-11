# Claude Code 작업 지시서 23 (수정판 B)
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_23.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 목표: OKR 평가 방식 추가 (조직도 기반 부서별 설정)

### 핵심 철학
```
"조직별 조직장과 협의해서 평가 방식을 결정한다"

HR(master/admin): 전사 기본값 설정 + 개인별 직접 설정
조직장(팀장):     자기 팀 평가 방식 설정 (하위 직원에게 상속)
직원:             소속 조직장의 방식을 자동 상속
```

### 평가 방식 상속 우선순위
```
1순위: 내 조직장(manager)의 eval_mode
2순위: 내 자신의 eval_mode (조직장인 경우)
3순위: 전사 기본값 (app_settings.eval_mode, 기본 MBO)
```

---

## 작업 1 — server/index.js: DB 및 API

### 1-1. migrations에 추가

```javascript
"ALTER TABLE users ADD COLUMN eval_mode TEXT DEFAULT 'MBO'",
`CREATE TABLE IF NOT EXISTS okr_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  period_label TEXT NOT NULL,
  eval_year TEXT NOT NULL,
  phase TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`,
`CREATE TABLE IF NOT EXISTS okr_objectives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0
)`,
`CREATE TABLE IF NOT EXISTS okr_key_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  objective_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  target_value REAL DEFAULT 100,
  current_value REAL DEFAULT 0,
  unit TEXT DEFAULT '%',
  weight INTEGER DEFAULT 33,
  sort_order INTEGER DEFAULT 0
)`,
```

### 1-2. app_settings 시드에 기본값 추가
```javascript
db.prepare("INSERT OR IGNORE INTO app_settings(key,value) VALUES('eval_mode','MBO')").run();
```

### 1-3. 평가 방식 API 추가 (GET /api/admin/eval-status 라우트 위에)

```javascript
// ── 평가 방식 API ─────────────────────────────────────────

// 내 평가 방식 조회 (조직장 설정 상속)
app.get('/api/settings/my-eval-mode', auth, (req, res) => {
  try {
    const me = db.prepare('SELECT manager_id, eval_mode FROM users WHERE id=?').get(req.user.sub);
    if (me?.manager_id) {
      const mgr = db.prepare('SELECT eval_mode FROM users WHERE id=?').get(me.manager_id);
      if (mgr?.eval_mode) return res.json({ mode: mgr.eval_mode, source: 'manager' });
    }
    if (me?.eval_mode) return res.json({ mode: me.eval_mode, source: 'self' });
    const global = db.prepare("SELECT value FROM app_settings WHERE key='eval_mode'").get();
    res.json({ mode: global?.value || 'MBO', source: 'global' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직장이 팀 평가 방식 설정
app.post('/api/settings/team-eval-mode', auth, (req, res) => {
  try {
    const { mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    const isManager = db.prepare('SELECT 1 FROM users WHERE manager_id=? LIMIT 1').get(req.user.sub);
    const isAdmin = ['master','admin'].includes(req.user.role);
    if (!isManager && !isAdmin)
      return res.status(403).json({ error: '하위 팀원이 없으면 설정할 수 없습니다.' });
    db.prepare('UPDATE users SET eval_mode=? WHERE id=?').run(mode, req.user.sub);
    auditLog(req.user.sub, 'TEAM_EVAL_MODE_CHANGED', req.user.sub, null,
      `팀 평가 방식 변경: ${mode}`, req.ip);
    res.json({ success: true, mode });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 전사 기본 평가 방식 (admin+)
app.get('/api/settings/eval-mode', auth, (req, res) => {
  const mode = db.prepare("SELECT value FROM app_settings WHERE key='eval_mode'").get();
  res.json({ mode: mode?.value || 'MBO' });
});
app.post('/api/settings/eval-mode', auth, adminOnly, (req, res) => {
  try {
    const { mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    db.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES('eval_mode',?)").run(mode);
    auditLog(req.user.sub, 'GLOBAL_EVAL_MODE_CHANGED', null, null,
      `전사 평가 방식 변경: ${mode}`, req.ip);
    res.json({ success: true, mode });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 특정 사용자 평가 방식 설정 (admin+)
app.patch('/api/users/:id/eval-mode', auth, adminOnly, (req, res) => {
  try {
    const { mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    db.prepare('UPDATE users SET eval_mode=? WHERE id=?').run(mode, req.params.id);
    const target = db.prepare('SELECT name FROM users WHERE id=?').get(req.params.id);
    auditLog(req.user.sub, 'USER_EVAL_MODE_CHANGED', req.params.id, target?.name,
      `평가 방식 변경: ${mode}`, req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// OKR CRUD
app.get('/api/okr', auth, (req, res) => {
  try {
    const cycles = db.prepare(
      'SELECT * FROM okr_cycles WHERE user_id=? ORDER BY created_at DESC'
    ).all(req.user.sub);
    const result = cycles.map(c => ({
      ...c,
      objectives: db.prepare(
        'SELECT * FROM okr_objectives WHERE cycle_id=? ORDER BY sort_order'
      ).all(c.id).map(obj => ({
        ...obj,
        key_results: db.prepare(
          'SELECT * FROM okr_key_results WHERE objective_id=? ORDER BY sort_order'
        ).all(obj.id)
      }))
    }));
    res.json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/okr', auth, (req, res) => {
  try {
    const { period_label, eval_year, objectives } = req.body;
    const r = db.prepare(
      "INSERT INTO okr_cycles(user_id,period_label,eval_year) VALUES(?,?,?)"
    ).run(req.user.sub, period_label, eval_year);
    const cycleId = r.lastInsertRowid;
    (objectives||[]).forEach((obj, oi) => {
      const or = db.prepare(
        'INSERT INTO okr_objectives(cycle_id,title,description,sort_order) VALUES(?,?,?,?)'
      ).run(cycleId, obj.title, obj.description||'', oi);
      (obj.key_results||[]).forEach((kr, ki) => {
        db.prepare(
          'INSERT INTO okr_key_results(objective_id,title,target_value,unit,weight,sort_order) VALUES(?,?,?,?,?,?)'
        ).run(or.lastInsertRowid, kr.title, kr.target_value||100, kr.unit||'%', kr.weight||33, ki);
      });
    });
    res.json({ id: cycleId });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/okr/:id/progress', auth, (req, res) => {
  try {
    const { kr_updates } = req.body;
    (kr_updates||[]).forEach(u => {
      db.prepare('UPDATE okr_key_results SET current_value=? WHERE id=?')
        .run(u.current_value, u.kr_id);
    });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

---

## 작업 2 — admin.js: 평가 방식 설정 UI

### 2-1. renderAdmPolicy에 전사 기본 평가 방식 추가

Promise.all에 추가:
```javascript
API.get('/settings/eval-mode'),
```

정책 UI에 추가 (다른 policy-row들과 함께):
```javascript
<div class="policy-row">
  <div>
    <div style="font-size:14px;font-weight:500">전사 기본 평가 방식</div>
    <div style="font-size:12px;color:var(--muted)">
      조직장이 별도 설정하지 않은 경우 이 방식이 적용됩니다
    </div>
  </div>
  <div style="display:flex;gap:8px">
    ${['MBO','OKR','KPI'].map(m =>
      `<button class="btn ${evalMode.mode===m?'btn-primary':'btn-ghost'} btn-sm"
        onclick="setGlobalEvalMode('${m}')">${m}</button>`
    ).join('')}
  </div>
</div>
```

setGlobalEvalMode 함수 추가:
```javascript
async function setGlobalEvalMode(mode) {
  try {
    await API.post('/settings/eval-mode', { mode });
    showAlert(`전사 기본 평가 방식이 ${mode}로 변경되었습니다.`, 'green');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

### 2-2. renderAdmStatus에 사용자별 평가 방식 표시 추가

전직원 현황 테이블의 각 행에 평가 방식 드롭다운 추가:
```javascript
<select style="font-size:11px;height:26px"
  onchange="changeUserEvalMode(${u.id}, this.value)">
  ${['MBO','OKR','KPI'].map(m =>
    `<option value="${m}" ${(u.eval_mode||'MBO')===m?'selected':''}>${m}</option>`
  ).join('')}
</select>
```

changeUserEvalMode 함수 추가:
```javascript
async function changeUserEvalMode(userId, mode) {
  try {
    await API.patch('/users/' + userId + '/eval-mode', { mode });
    showAlert('평가 방식이 변경되었습니다.', 'green');
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 작업 3 — my-eval.js: 평가 방식 로드 및 OKR 배너

### Pages.myEval Promise.all에 추가:
```javascript
API.get('/settings/my-eval-mode').catch(() => ({ mode: 'MBO', source: 'global' })),
```

### OKR 모드 배너 (기존 eval 목록 표시 전):
```javascript
if (evalMode.mode === 'OKR') {
  const banner = document.createElement('div');
  banner.className = 'alert alert-teal';
  banner.style.marginBottom = '10px';
  banner.innerHTML = `
    <strong>🎯 OKR 평가 모드</strong>
    <span style="font-size:12px;margin-left:6px;opacity:.8">
      (${evalMode.source === 'manager' ? '조직장 설정' : evalMode.source === 'self' ? '내 설정' : '전사 기본값'})
    </span>
    <button class="btn btn-ghost btn-sm" style="margin-left:12px"
      onclick="Pages.okrEval()">OKR 작성하기 →</button>`;
  area.appendChild(banner);
}
```

---

## 작업 4 — 새 파일 생성: public/js/pages/okr-eval.js

```javascript
Pages.okrEval = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const cycles = await API.get('/api/okr').catch(() => []);
    area.innerHTML = '';

    // 헤더
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px';
    header.innerHTML = `
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--o800)">🎯 OKR 목표 설정</div>
        <div style="font-size:12px;color:var(--muted)">Objectives and Key Results</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="Pages.myEval()">← 내 평가</button>
        <button class="btn btn-primary" onclick="startNewOKR()">+ 새 OKR 작성</button>
      </div>`;
    area.appendChild(header);

    if (!cycles.length) {
      area.innerHTML += `<div class="card">
        <div class="alert alert-orange">작성된 OKR이 없습니다.
          <button class="btn btn-ghost btn-sm" style="margin-left:8px"
            onclick="startNewOKR()">지금 작성하기 →</button>
        </div></div>`;
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
            <div style="text-align:center">
              <div style="font-size:28px;font-weight:800;color:${col}">${avg}%</div>
              <div style="font-size:11px;color:var(--muted)">전체 달성률</div>
            </div>
            <button class="btn btn-ghost btn-sm"
              onclick="updateOKRProgress(${cycle.id})">진행률 업데이트</button>
          </div>
        </div>
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

function startNewOKR() {
  _okrObjCount = 0; _okrKRCount = {};
  const area = document.getElementById('main-area');
  area.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-header-t">🎯 OKR 작성</div>
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
      <button class="btn btn-ghost" onclick="Pages.okrEval()">취소</button>
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

// 단위 직접 입력 토글
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
    const periods = await API.get('/eval-periods/active').catch(() => []);
    const period = periods[0];
    if (!period) { showAlert('활성화된 평가 기간이 없습니다.', 'red'); return; }
    await API.post('/api/okr', { period_label: period.period_label, eval_year: period.eval_year, objectives });
    showAlert('OKR이 저장되었습니다!', 'green');
    setTimeout(() => Pages.okrEval(), 600);
  } catch(e) { showAlert(e.message, 'red'); }
}

async function updateOKRProgress(cycleId) {
  const cycles = await API.get('/api/okr').catch(() => []);
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
    await API.post(`/api/okr/${cycleId}/progress`, { kr_updates });
    showAlert('진행률이 업데이트되었습니다!', 'green');
    setTimeout(() => Pages.okrEval(), 600);
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 작업 5 — index.html에 스크립트 태그 추가

`<script src="/js/pages/my-eval.js"></script>` 바로 다음에:
```html
<script src="/js/pages/okr-eval.js"></script>
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | OKR 평가 방식 추가 - 조직도 기반 부서별 설정, okr-eval.js 신규 생성 | Claude Code |
```

### DB 스키마에 추가:
```
users:           ... eval_mode TEXT DEFAULT 'MBO' (추가)
okr_cycles:      id, user_id, period_label, eval_year, phase
okr_objectives:  id, cycle_id, title, description, sort_order
okr_key_results: id, objective_id, title, target_value, current_value, unit, weight, sort_order
```

### API 목록에 추가:
```
GET    /api/settings/my-eval-mode      내 평가 방식 조회 (조직장 상속)
POST   /api/settings/team-eval-mode    조직장이 팀 평가 방식 설정
GET    /api/settings/eval-mode         전사 기본 평가 방식 조회
POST   /api/settings/eval-mode         전사 기본 평가 방식 변경 (admin+)
PATCH  /api/users/:id/eval-mode        특정 사용자 평가 방식 설정 (admin+)
GET    /api/okr                        내 OKR 목록
POST   /api/okr                        OKR 생성
POST   /api/okr/:id/progress           OKR 달성률 업데이트
```

### 핵심 설계 원칙에 추가:
```
- 평가 방식 (eval_mode): MBO / OKR / KPI
  상속 우선순위: 조직장 설정 > 본인 설정 > 전사 기본값
  조직장: team-eval-mode API로 팀 방식 설정
  HR: 전사 기본값 + 개인별 직접 설정 가능
  OKR 페이지: Pages.okrEval() (okr-eval.js)
  OKR 구조: Objective → Key Results (달성률 0~100%)
```
