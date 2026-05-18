# Claude Code 작업 지시서 25
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_25.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]
[작업 완료 후 git push는 하지 말 것]

---

## 작업 목표: 평가 기간별 평가방식 분기

### 핵심 설계
```
각 평가 기간 카드마다 해당 기간의 평가방식 확인:
  OKR/KPI → [OKR 작성하기 →] 버튼으로 교체
  MBO     → 기존 [목표 작성 시작 →] 버튼 유지

OKR 모드 필터 제거:
  기존: OKR 모드 시 모든 진행 중 카드 숨김 (잘못된 방식)
  수정: 각 카드별로 방식에 따라 버튼만 교체
```

---

## 작업 1 — server/index.js: 기간별 내 평가방식 API 추가

GET /api/settings/my-eval-mode 라우트 위에 아래 API 추가:

```javascript
// 활성 기간별 내 평가방식 목록
app.get('/api/eval-periods/my-modes', auth, (req, res) => {
  try {
    const activePeriods = db.prepare(
      "SELECT * FROM eval_periods WHERE is_active=1 ORDER BY eval_year DESC, id DESC"
    ).all();

    const result = activePeriods.map(period => {
      // 계층 탐색 (최대 5단계)
      let currentId = req.user.sub;
      for (let depth = 0; depth < 5; depth++) {
        const user = db.prepare(
          'SELECT manager_id FROM users WHERE id=?'
        ).get(currentId);

        const checkId = currentId;
        const orgMode = db.prepare(
          'SELECT eval_mode FROM eval_period_modes WHERE period_id=? AND manager_id=?'
        ).get(period.id, checkId);

        if (orgMode) {
          return {
            period_id: period.id,
            period_label: period.period_label,
            eval_year: period.eval_year,
            mode: orgMode.eval_mode,
            source: 'org_period'
          };
        }

        if (!user?.manager_id) break;
        currentId = user.manager_id;
      }

      // 기간 전사 기본값
      return {
        period_id: period.id,
        period_label: period.period_label,
        eval_year: period.eval_year,
        mode: period.eval_mode || 'MBO',
        source: 'period'
      };
    });

    res.json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

---

## 작업 2 — my-eval.js: 기간별 평가방식 분기

### 2-1. Pages.myEval Promise.all에 my-modes 추가

```javascript
const [evs, activePeriods, approverRes, evalMode, periodModes] = await Promise.all([
  API.get('/evals'),
  API.get('/eval-periods/active').catch(() => []),
  API.get(`/users/${App.user.id}/approvers`).catch(() => []),
  API.get('/settings/my-eval-mode').catch(() => ({ mode: 'MBO', source: 'global' })),
  API.get('/eval-periods/my-modes').catch(() => []),
]);
```

### 2-2. OKR 전체 필터 제거

기존:
```javascript
if (evalMode?.mode === 'OKR') {
  evs = evs.filter(ev => ev.phase === 'final_done');
}
```
위 코드를 삭제해줘.

### 2-3. 각 평가기간 카드의 버튼을 기간별 방식에 따라 분기

활성 기간 카드를 렌더링하는 부분을 찾아서
각 카드의 [목표 작성 시작 →] 버튼 부분을 아래로 교체:

```javascript
// 해당 기간의 평가방식 확인
const periodMode = periodModes.find(pm =>
  pm.period_label === period.period_label &&
  pm.eval_year === String(period.eval_year)
)?.mode || 'MBO';

// 버튼 분기
const actionBtn = periodMode === 'OKR' || periodMode === 'KPI'
  ? `<button class="btn btn-primary"
       onclick="Pages.okrEval('${period.period_label}', '${period.eval_year}', '${periodMode}')">
       🎯 ${periodMode} 작성하기 →
     </button>`
  : `<button class="btn btn-primary"
       onclick="startGoalForm(${ev?.id || 0}, '${period.period_label}', '${period.eval_year}')">
       목표 작성 시작 →
     </button>`;
```

### 2-4. OKR 배너 수정

기존 OKR 배너를 더 간결하게:
```javascript
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
```

---

## 작업 3 — okr-eval.js: 기간 파라미터 수신

### Pages.okrEval 함수 시그니처 수정

```javascript
Pages.okrEval = async function(periodLabel, evalYear, mode) {
  // periodLabel, evalYear 가 있으면 해당 기간 OKR만 표시
  // 없으면 전체 목록 표시 (기존 동작)
  ...
}
```

헤더 부분에 현재 기간 표시:
```javascript
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
}
```

### startNewOKR 함수도 기간 파라미터 수신하도록 수정

```javascript
function startNewOKR(periodLabel, evalYear) {
  _okrObjCount = 0; _okrKRCount = {};
  _currentPeriodLabel = periodLabel;
  _currentEvalYear = evalYear;
  ...
}
```

submitOKR에서 파라미터 사용:
```javascript
// 기간 파라미터가 있으면 우선 사용
const label = _currentPeriodLabel || period?.period_label;
const year  = _currentEvalYear  || period?.eval_year;
await API.post('/api/okr', {
  period_label: label,
  eval_year: year,
  objectives,
});
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 평가기간별 평가방식 분기 (OKR/KPI기간→OKR버튼, MBO기간→MBO버튼) | Claude Code |
```

### API 목록에 추가:
```
GET /api/eval-periods/my-modes  활성 기간별 내 평가방식 목록
```

### 핵심 설계 원칙 추가:
```
- 내 평가 탭 기간 카드 버튼 분기:
  해당 기간 평가방식이 OKR/KPI → 🎯 OKR 작성하기 버튼
  해당 기간 평가방식이 MBO → 목표 작성 시작 버튼 (기존)
```
