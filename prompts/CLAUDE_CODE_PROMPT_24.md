# Claude Code 작업 지시서 24
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_24.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 목표: 조직 × 시기 × 평가방식 3차원 매핑

### 핵심 설계
```
평가방식 결정 우선순위:
  1순위: eval_period_modes (조직장 + 평가기간 조합)
  2순위: eval_periods.eval_mode (전사 기간 기본값)
  3순위: app_settings.eval_mode (전사 전체 기본값 MBO)

잠금 규칙:
  - 평가 기간 활성화 시 → 전사 기본방식 잠금
  - 평가 기간 완료(모든 eval final_done) 시 → 조직별 방식도 잠금
  - master/admin은 강제 변경 가능 (경고 표시)
```

---

## 작업 1 — server/index.js: DB 추가

### 1-1. migrations에 추가

```javascript
// eval_periods에 컬럼 추가
"ALTER TABLE eval_periods ADD COLUMN eval_mode TEXT DEFAULT 'MBO'",
"ALTER TABLE eval_periods ADD COLUMN locked INTEGER DEFAULT 0",

// 신규: 조직별 기간별 평가방식
`CREATE TABLE IF NOT EXISTS eval_period_modes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id   INTEGER NOT NULL,
  manager_id  INTEGER NOT NULL,
  eval_mode   TEXT NOT NULL DEFAULT 'MBO',
  locked      INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(period_id, manager_id)
)`,
```

### 1-2. 평가방식 조회 API 수정 (my-eval-mode)

기존 GET /api/settings/my-eval-mode 를 아래로 교체:

```javascript
app.get('/api/settings/my-eval-mode', auth, (req, res) => {
  try {
    const me = db.prepare('SELECT manager_id, eval_mode FROM users WHERE id=?').get(req.user.sub);

    // 현재 활성 평가 기간 조회
    const activePeriod = db.prepare(
      "SELECT * FROM eval_periods WHERE is_active=1 ORDER BY id DESC LIMIT 1"
    ).get();

    if (activePeriod) {
      // 1순위: 조직장 + 기간 조합
      if (me?.manager_id) {
        const orgMode = db.prepare(
          'SELECT eval_mode FROM eval_period_modes WHERE period_id=? AND manager_id=?'
        ).get(activePeriod.id, me.manager_id);
        if (orgMode) return res.json({ mode: orgMode.eval_mode, source: 'org_period',
          period: activePeriod.period_label });
      }
      // 본인이 조직장인 경우
      const selfMode = db.prepare(
        'SELECT eval_mode FROM eval_period_modes WHERE period_id=? AND manager_id=?'
      ).get(activePeriod.id, req.user.sub);
      if (selfMode) return res.json({ mode: selfMode.eval_mode, source: 'org_period',
        period: activePeriod.period_label });

      // 2순위: 기간 전사 기본값
      if (activePeriod.eval_mode)
        return res.json({ mode: activePeriod.eval_mode, source: 'period',
          period: activePeriod.period_label });
    }

    // 3순위: 전사 전체 기본값
    const global = db.prepare("SELECT value FROM app_settings WHERE key='eval_mode'").get();
    res.json({ mode: global?.value || 'MBO', source: 'global' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

### 1-3. 평가기간별 전사 기본방식 설정 API 추가

```javascript
// 평가기간 전사 기본방식 설정/조회
app.get('/api/eval-periods/:id/eval-mode', auth, adminOnly, (req, res) => {
  try {
    const period = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(req.params.id);
    if (!period) return res.status(404).json({ error: '기간을 찾을 수 없습니다.' });
    res.json({ eval_mode: period.eval_mode || 'MBO', locked: period.locked });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/eval-periods/:id/eval-mode', auth, adminOnly, (req, res) => {
  try {
    const { eval_mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(eval_mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });

    const period = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(req.params.id);
    if (!period) return res.status(404).json({ error: '기간을 찾을 수 없습니다.' });

    // 잠금 여부 확인 (master는 강제 변경 가능)
    if (period.locked && req.user.role !== 'master') {
      return res.status(400).json({ error: '잠긴 평가 기간의 방식은 변경할 수 없습니다.' });
    }

    db.prepare('UPDATE eval_periods SET eval_mode=? WHERE id=?').run(eval_mode, req.params.id);
    auditLog(req.user.sub, 'PERIOD_EVAL_MODE_CHANGED', req.params.id,
      period.period_label, `평가기간 방식 변경: ${eval_mode}`, req.ip);

    const warning = period.locked ? '⚠ 잠긴 기간을 강제 변경했습니다.' : null;
    res.json({ success: true, warning });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직별 기간별 평가방식 조회
app.get('/api/eval-periods/:id/org-modes', auth, adminOnly, (req, res) => {
  try {
    // 모든 조직장(하위 직원이 있는 사람) 조회
    const managers = db.prepare(`
      SELECT DISTINCT u.id, u.name, u.title, u.dept,
        COALESCE(epm.eval_mode, ep.eval_mode, 'MBO') as eval_mode,
        epm.locked as org_locked
      FROM users u
      LEFT JOIN eval_period_modes epm ON epm.manager_id=u.id AND epm.period_id=?
      LEFT JOIN eval_periods ep ON ep.id=?
      WHERE u.id IN (SELECT DISTINCT manager_id FROM users WHERE manager_id IS NOT NULL)
      AND u.is_active=1
      ORDER BY u.name
    `).all(req.params.id, req.params.id);
    res.json(managers);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직별 기간별 평가방식 설정
app.post('/api/eval-periods/:id/org-modes', auth, adminOnly, (req, res) => {
  try {
    const { manager_id, eval_mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(eval_mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });

    const period = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(req.params.id);
    if (!period) return res.status(404).json({ error: '기간을 찾을 수 없습니다.' });

    // 조직 잠금 확인
    const existing = db.prepare(
      'SELECT locked FROM eval_period_modes WHERE period_id=? AND manager_id=?'
    ).get(req.params.id, manager_id);
    if (existing?.locked && req.user.role !== 'master')
      return res.status(400).json({ error: '잠긴 조직의 방식은 변경할 수 없습니다.' });

    db.prepare(`
      INSERT INTO eval_period_modes(period_id, manager_id, eval_mode)
      VALUES(?,?,?)
      ON CONFLICT(period_id, manager_id) DO UPDATE SET eval_mode=?
    `).run(req.params.id, manager_id, eval_mode, eval_mode);

    const mgr = db.prepare('SELECT name FROM users WHERE id=?').get(manager_id);
    auditLog(req.user.sub, 'ORG_EVAL_MODE_CHANGED', manager_id, mgr?.name,
      `조직 평가방식 변경 (${period.period_label}): ${eval_mode}`, req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 평가기간 잠금 (admin+)
app.post('/api/eval-periods/:id/lock', auth, adminOnly, (req, res) => {
  try {
    db.prepare('UPDATE eval_periods SET locked=1 WHERE id=?').run(req.params.id);
    // 해당 기간의 모든 조직별 방식도 잠금
    db.prepare('UPDATE eval_period_modes SET locked=1 WHERE period_id=?').run(req.params.id);
    const period = db.prepare('SELECT period_label FROM eval_periods WHERE id=?').get(req.params.id);
    auditLog(req.user.sub, 'PERIOD_LOCKED', req.params.id,
      period?.period_label, '평가기간 방식 잠금', req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

---

## 작업 2 — admin.js: 평가기간 관리 탭 UI 개선

### renderAdmPeriods 함수를 찾아서 각 기간 카드에 평가방식 설정 UI 추가

각 기간(period) 카드 안에 아래 UI 추가:

```javascript
// 기간 카드 내부에 추가
const modeSection = document.createElement('div');
modeSection.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid var(--o100)';
modeSection.innerHTML = `
  <div style="font-size:13px;font-weight:600;color:var(--o800);margin-bottom:10px">
    📊 평가방식 설정
    ${period.locked ? '<span class="bd bd-locked" style="font-size:11px;margin-left:6px">🔒 잠김</span>' : ''}
  </div>

  <!-- 전사 기본방식 -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <span style="font-size:12px;color:var(--muted);min-width:80px">전사 기본</span>
    <div style="display:flex;gap:6px">
      ${['MBO','OKR','KPI'].map(m => `
        <button class="btn btn-sm ${(period.eval_mode||'MBO')===m?'btn-primary':'btn-ghost'}"
          ${period.locked?'disabled':''}
          onclick="setPeriodEvalMode(${period.id},'${m}',this)"
          style="font-size:12px;padding:3px 10px">${m}</button>
      `).join('')}
    </div>
    ${period.locked
      ? '<span style="font-size:11px;color:var(--muted)">잠금 상태</span>'
      : `<button class="btn btn-sm" style="font-size:11px;border:1px solid var(--o300);color:var(--o600)"
           onclick="lockPeriodMode(${period.id})">🔒 방식 잠금</button>`}
  </div>

  <!-- 조직별 방식 -->
  <div id="org-modes-${period.id}">
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">조직별 설정 로딩 중...</div>
  </div>`;

card.appendChild(modeSection);
loadOrgModes(period.id, period.locked);
```

### loadOrgModes 함수 추가:

```javascript
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
          <div style="min-width:120px">
            <span style="font-size:12px;font-weight:500">${mgr.name}</span>
            <span style="font-size:11px;color:var(--muted);margin-left:4px">${mgr.title||''}</span>
          </div>
          <div style="display:flex;gap:4px">
            ${['MBO','OKR','KPI'].map(m => `
              <button class="btn btn-sm ${mgr.eval_mode===m?'btn-primary':'btn-ghost'}"
                ${periodLocked||mgr.org_locked?'disabled':''}
                onclick="setOrgEvalMode(${periodId},${mgr.id},'${m}',this)"
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
```

### setPeriodEvalMode, setOrgEvalMode, lockPeriodMode 함수 추가:

```javascript
async function setPeriodEvalMode(periodId, mode, btn) {
  try {
    const r = await API.post(`/eval-periods/${periodId}/eval-mode`, { eval_mode: mode });
    if (r.warning) showAlert(r.warning, 'orange');
    else showAlert(`전사 기본 평가방식이 ${mode}로 변경되었습니다.`, 'green');
    // 버튼 상태 업데이트
    const siblings = btn.parentElement.querySelectorAll('button');
    siblings.forEach(b => { b.className = b.className.replace('btn-primary','btn-ghost'); });
    btn.className = btn.className.replace('btn-ghost','btn-primary');
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
```

---

## 작업 3 — admin.js: 평가정책 탭 정리

### renderAdmPolicy 함수에서

전사 기본 평가방식 버튼 UI를 아래 안내문으로 교체:
```javascript
<div class="policy-row">
  <div>
    <div style="font-size:14px;font-weight:500">평가 방식 설정</div>
    <div style="font-size:12px;color:var(--muted)">
      평가방식은 <strong>평가기간 관리</strong> 탭에서 기간별/조직별로 설정하세요.
    </div>
  </div>
  <button class="btn btn-ghost btn-sm" onclick="switchTab('adm-periods')">
    평가기간 관리 →
  </button>
</div>
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 평가방식 3차원 매핑 (조직×기간×방식), eval_period_modes 테이블, 기간별 잠금 기능 | Claude Code |
```

### DB 스키마에 추가:
```
eval_periods:      ... eval_mode TEXT DEFAULT 'MBO', locked INTEGER DEFAULT 0 (추가)
eval_period_modes: id, period_id, manager_id, eval_mode, locked, created_at
                   UNIQUE(period_id, manager_id)
```

### API 목록에 추가:
```
GET    /api/eval-periods/:id/eval-mode    기간 전사 기본방식 조회
POST   /api/eval-periods/:id/eval-mode    기간 전사 기본방식 설정 (admin+)
GET    /api/eval-periods/:id/org-modes    기간 조직별 방식 조회 (admin+)
POST   /api/eval-periods/:id/org-modes    기간 조직별 방식 설정 (admin+)
POST   /api/eval-periods/:id/lock         기간 방식 잠금 (admin+)
```

### 핵심 설계 원칙 수정:
```
- 평가방식 3차원 매핑: 조직(manager) × 시기(period) × 방식(MBO/OKR/KPI)
  결정 우선순위:
    1. eval_period_modes (조직장+기간 조합)
    2. eval_periods.eval_mode (기간 전사 기본값)
    3. app_settings.eval_mode (전사 전체 기본값)
  잠금:
    - 평가기간 방식 잠금: admin이 수동 잠금
    - 잠금 후 master만 강제 변경 가능
  관리 위치: 관리자 설정 → 평가기간 관리 탭
```
