# Claude Code 작업 지시서 18
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_18.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 목표: 최종평가 등급 선택 복구 + 2차 평가자도 등급 선택 가능하게

### 현재 문제
- `renderFinalMgr` 함수에서 grades 로드 및 등급 선택 UI가 누락된 상태
- 2차 평가자(CEO)에게 등급 선택이 표시되지 않음

### 올바른 설계
```
1차 평가자: 별점 입력 + 등급 선택 + 종합의견 → '최종 평가 확정' 버튼
2차 평가자: 등급 선택 + 종합의견 (별점 입력만 없음) → '2차 최종평가 제출' 버튼
```

---

## 작업 1 — final-eval.js: grades 로드 추가

### 1-1. renderFinalMgr 함수에서 Promise.all에 grades 추가

파일을 열어서 `renderFinalMgr` 함수 안의 Promise.all을 찾아라.

아래처럼 grades가 포함되어 있는지 확인:
```javascript
const [goals, fe, fbs, grades] = await Promise.all([
  API.get(`/evals/${ev.id}/goals`),
  API.get(`/final/${ev.id}`),
  API.get(`/feedback/${ev.id}`),
  API.get('/grade-criteria').catch(() => []),
]);
```

없으면 위 코드로 교체.

---

## 작업 2 — final-eval.js: 등급 선택 UI 추가

### 2-1. bottomSection에 등급 선택 드롭다운 추가

bottomSection.innerHTML 안에 종합의견 textarea 위에
**1차/2차 모두** 등급 선택이 표시되도록 아래 코드 추가:

```javascript
bottomSection.innerHTML = `
  ${grades.length ? `
  <div style="margin-top:12px">
    <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">
      최종 등급 선택 <span style="color:var(--red)">*</span>
    </label>
    <select id="fin-grade-sel-${ev.id}"
      style="width:100%;height:38px;font-size:13px;margin-bottom:6px">
      <option value="">— 등급을 선택하세요 —</option>
      ${grades.map(g =>
        `<option value="${g.grade_code}">
          ${g.grade_name}${g.note ? ' (' + g.note + ')' : ''}
        </option>`
      ).join('')}
    </select>
    <div id="fin-grade-desc-${ev.id}"
      style="font-size:12px;color:var(--muted);padding:6px 10px;
             background:var(--o50);border-radius:6px;display:none;margin-bottom:10px">
    </div>
  </div>` : ''}
  <div style="margin-top:4px">
    <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">
      ${ev.is_second ? '2차 평가자 종합의견' : '상사 종합 의견'}
    </label>
    <textarea id="fin-mgr-note-${ev.id}"
      placeholder="${ev.is_second ? '2차 평가자 의견을 작성하세요...' : '성과 총평 및 향후 육성 방향을 작성하세요...'}"
      style="width:100%;min-height:80px;resize:vertical"></textarea>
  </div>
  <div class="abar">
    <button class="btn btn-purple"
      onclick="submitFinalMgr(${ev.id},${ev.is_second||0})">
      ${ev.is_second ? '2차 최종평가 제출' : '최종 평가 확정 — 잠금 처리됩니다'}
    </button>
  </div>`;
```

### 2-2. 등급 선택 시 설명 표시 이벤트 리스너 추가

body.appendChild(bottomSection) 바로 다음에:

```javascript
// 등급 선택 시 설명 표시
setTimeout(() => {
  const sel    = document.getElementById('fin-grade-sel-' + ev.id);
  const descEl = document.getElementById('fin-grade-desc-' + ev.id);
  if (sel && descEl) {
    sel.addEventListener('change', () => {
      const selected = grades.find(g => g.grade_code === sel.value);
      if (selected?.description) {
        descEl.textContent  = selected.description;
        descEl.style.display = 'block';
      } else {
        descEl.style.display = 'none';
      }
    });
  }
}, 100);
```

---

## 작업 3 — final-eval.js: submitFinalMgr 함수 수정

### 3-1. 1차/2차 모두 등급 선택 검증 및 전송

```javascript
async function submitFinalMgr(evalId, isSecond) {
  const confirmMsg = isSecond
    ? '2차 최종평가를 제출하시겠습니까? 제출 후 최종 잠금됩니다.'
    : '최종 평가를 확정하면 잠금 처리되어 인사팀 외에는 수정할 수 없습니다. 계속하시겠습니까?';
  if (!confirm(confirmMsg)) return;

  const note          = document.getElementById(`fin-mgr-note-${evalId}`)?.value || '';
  const selectedGrade = document.getElementById(`fin-grade-sel-${evalId}`)?.value || '';

  // 등급 선택 필수 검증 (1차/2차 모두)
  if (!selectedGrade) {
    showAlert('최종 등급을 선택해주세요.', 'orange');
    return;
  }

  // 2차 평가자: 별점 없이 등급 + 의견만 제출
  if (isSecond) {
    try {
      await API.post(`/final/${evalId}/mgr`, {
        mgr_note: note,
        scores: [],
        selected_grade: selectedGrade,
        is_second: true,
      });
      showAlert('2차 최종평가가 제출되었습니다.', 'green');
      setTimeout(() => Pages.finalEval(), 1000);
    } catch(e) { showAlert(e.message, 'red'); }
    return;
  }

  // 1차 평가자: 별점 필수
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
    const res = await API.post(`/final/${evalId}/mgr`, {
      mgr_note: note,
      scores,
      selected_grade: selectedGrade,
    });
    showAlert(`최종 평가 확정! 점수: ${res.final_score}점 / 등급: ${res.grade}`, 'green');
    setTimeout(() => Pages.finalEval(), 1000);
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 작업 4 — server/index.js: 2차 평가자 selected_grade 저장 확인

### 4-1. POST /api/final/:evalId/mgr 에서 2차 제출 시 selected_grade 저장

2차 제출(isSecond) 처리 부분에서:
```javascript
db.prepare(`UPDATE final_evaluations
  SET second_mgr_note=?, second_mgr_done=1,
      second_mgr_done_at=datetime('now'), second_mgr_id=?,
      second_selected_grade=?
  WHERE id=?`)
  .run(encrypt(mgr_note||''), req.user.sub, selected_grade||'', fe.id);
```

단, `second_selected_grade` 컬럼이 없으면 migrations에 추가:
```javascript
"ALTER TABLE final_evaluations ADD COLUMN second_selected_grade TEXT",
```

없으면 기존 `second_mgr_note` UPDATE에 `selected_grade`만 추가해도 됨.

---

## 작업 5 — /api/evals/my-history API 누락 확인 및 추가

### 5-1. server/index.js에서 /api/evals/my-history 확인

grep으로 `/api/evals/my-history` 라우트가 있는지 확인.
없으면 `/api/approvals/my-history` 라우트 바로 위에 추가:

```javascript
// 내 목표 승인 이력 전체 (내 평가 - 과거 목표승인 이력용)
app.get('/api/evals/my-history', auth, (req, res) => {
  try {
    const evs = db.prepare(
      "SELECT * FROM eval_cycles WHERE user_id=? ORDER BY created_at DESC"
    ).all(req.user.sub);

    const result = evs.map(ev => {
      const goals = db.prepare(
        `SELECT g.*, c.name as cat_name FROM goals g
         JOIN goal_categories c ON g.category_id=c.id
         WHERE g.eval_id=? ORDER BY c.sort_order, g.sort_order`
      ).all(ev.id).map(g => ({
        ...g,
        name: g.name ? decrypt(g.name) : '',
        kpi:  g.kpi  ? decrypt(g.kpi)  : '',
      }));

      const approvals = db.prepare(
        `SELECT a.*, u.name as approver_name, u.title as approver_title
         FROM goal_approvals a JOIN users u ON a.approver_id=u.id
         WHERE a.eval_id=? ORDER BY a.created_at DESC`
      ).all(ev.id).map(a => ({
        ...a,
        note: a.note ? decrypt(a.note) : '',
      }));

      return {
        ...ev,
        self_reason:   ev.self_reason   ? decrypt(ev.self_reason)   : '',
        reject_reason: ev.reject_reason ? decrypt(ev.reject_reason) : '',
        goals,
        approvals,
      };
    });
    res.json(result);
  } catch(err) {
    console.error('[evals/my-history]', err);
    res.status(500).json({ error: err.message });
  }
});
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 최종평가 등급선택 복구(1차/2차 모두), /api/evals/my-history API 추가 | Claude Code |
```

### 핵심 설계 원칙 수정 (15번):
```
15. 최종평가 등급: 1차/2차 평가자 모두 등급 선택 필수
    - 1차: 별점 + 등급 + 종합의견
    - 2차: 등급 + 종합의견 (별점 없음)
    - selected_grade / second_selected_grade로 각각 저장
```

### API 목록에 추가:
```
GET /api/evals/my-history  내 목표 승인 이력 전체 (과거 이력 패널용)
```
