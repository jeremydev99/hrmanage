# Claude Code 작업 지시서 21
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_21.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 목표: 2차 평가자도 별점 입력 가능하도록 변경

### 변경 후 표시 방식
```
자기 ★★★★★ 5점  1차 ★★★★☆ 4점  2차 ★★★★☆ 4점
```

---

## 작업 1 — server/index.js: 2차 별점 저장

### 1-1. migrations에 컬럼 추가
migrations 배열에 추가:
```javascript
"ALTER TABLE final_eval_scores ADD COLUMN second_mgr_score INTEGER",
```

### 1-2. POST /api/final/:evalId/mgr — 2차 제출 시 별점 저장

isSecond 처리 블록에서 scores를 받아서 저장하도록 수정:

```javascript
if (isSecond) {
  // 1차가 완료됐는지 확인
  if (!fe.mgr_done) return res.status(400).json({ error: '1차 평가자가 먼저 평가를 완료해야 합니다.' });

  // 2차 별점 저장
  (scores||[]).forEach(s => {
    const ex = db.prepare('SELECT id FROM final_eval_scores WHERE final_id=? AND goal_id=?').get(fe.id, s.goal_id);
    if (ex) {
      db.prepare('UPDATE final_eval_scores SET second_mgr_score=? WHERE id=?').run(s.score, ex.id);
    } else {
      db.prepare('INSERT INTO final_eval_scores(final_id,goal_id,second_mgr_score) VALUES(?,?,?)').run(fe.id, s.goal_id, s.score);
    }
  });

  db.prepare(`UPDATE final_evaluations
    SET second_mgr_note=?, second_mgr_done=1,
        second_mgr_done_at=datetime('now'), second_mgr_id=?,
        selected_grade=COALESCE(?,selected_grade)
    WHERE id=?`)
    .run(encrypt(mgr_note||''), req.user.sub, selected_grade||null, fe.id);

  db.prepare(`UPDATE eval_cycles SET phase='final_done', locked=1, updated_at=datetime('now') WHERE id=?`).run(ev.id);
  db.prepare(`UPDATE final_evaluations SET locked=1, locked_at=datetime('now') WHERE id=?`).run(fe.id);

  const t2 = db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id);
  auditLog(req.user.sub, 'FINAL_EVAL_2ND', ev.user_id, t2?.name,
    `2차 최종평가 완료 (${ev.period_label||''})`, req.ip);
  res.json({ success: true, is_second: true });
}
```

---

## 작업 2 — final-eval.js: 2차 평가자 UI에 별점 추가

### 2-1. renderFinalMgr 함수에서 2차 평가자 goalsSection 표시

현재 2차 평가자(`ev.is_second`)에게 goalsSection을 숨기는 코드를 찾아서
별점은 표시하되 등급 선택만 숨기도록 수정:

```javascript
// 기존: if (!ev.is_second) { goalsSection 전체 숨김 }
// 수정: goalsSection은 1차/2차 모두 표시
//       등급 선택 드롭다운만 1차에게만 표시

// bottomSection에서 등급 선택 조건:
${!ev.is_second && grades.length ? `...등급 선택 UI...` : ''}
```

### 2-2. submitFinalMgr 함수에서 2차도 별점 수집

```javascript
// 2차 평가자도 별점 수집
if (isSecond) {
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
    await API.post(`/final/${evalId}/mgr`, {
      mgr_note: note,
      scores,
      selected_grade: selectedGrade || '',
      is_second: true,
    });
    showAlert('2차 최종평가가 제출되었습니다.', 'green');
    setTimeout(() => Pages.finalEval(), 1000);
  } catch(e) { showAlert(e.message, 'red'); }
  return;
}
```

---

## 작업 3 — approvals.js: 승인 이력에 2차 별점 표시

### 3-1. server/index.js — /api/approvals/my-history enriched에 second_mgr_score 포함

scores 조회 시 second_mgr_score도 포함되므로 별도 수정 불필요.
(SELECT * FROM final_eval_scores에 이미 포함됨)

### 3-2. approvals.js — 목표별 평가에 2차 별점 추가

카드의 목표별 평가 부분에서:

```javascript
${(h.goals||[]).map(g => {
  const sc = (h.final_eval.scores||[]).find(s=>String(s.goal_id)===String(g.id));
  const ss  = sc?.self_score        || 0;
  const ms  = sc?.mgr_score         || 0;
  const ms2 = sc?.second_mgr_score  || 0;
  if (!ss && !ms && !ms2) return '';
  return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;
                       border-bottom:1px solid var(--o50);flex-wrap:wrap">
    <span style="flex:1;font-size:12px;font-weight:500">${g.name||''}</span>
    ${ss  ? `<span style="font-size:12px;color:var(--muted)">자기 ${'★'.repeat(ss)}${'☆'.repeat(5-ss)} ${ss}점</span>` : ''}
    ${ms  ? `<span style="font-size:12px;color:var(--o500)">1차 ${'★'.repeat(ms)}${'☆'.repeat(5-ms)} ${ms}점</span>` : ''}
    ${ms2 ? `<span style="font-size:12px;color:var(--o700)">2차 ${'★'.repeat(ms2)}${'☆'.repeat(5-ms2)} ${ms2}점</span>` : ''}
  </div>`;
}).join('')}
```

---

## 작업 4 — final-eval.js: 최종평가 완료 화면에도 2차 별점 표시

### mgr_done=1 완료 화면(doneDiv)에서 목표별 별점에 2차 추가:

```javascript
${goals.map(g => {
  const sc  = (fe.scores||[]).find(s => String(s.goal_id) === String(g.id));
  const ms  = sc?.mgr_score        || 0;
  const ss  = sc?.self_score       || 0;
  const ms2 = sc?.second_mgr_score || 0;
  return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;
                       border-bottom:1px solid var(--o50);font-size:13px;flex-wrap:wrap">
    <span style="flex:1;font-weight:500">${g.name}</span>
    ${ss  ? `<span style="color:var(--muted)">자기 ${'★'.repeat(ss)}${'☆'.repeat(5-ss)}</span>`  : ''}
    ${ms  ? `<span style="color:var(--o500)">1차 ${'★'.repeat(ms)}${'☆'.repeat(5-ms)} ${ms}점</span>`  : ''}
    ${ms2 ? `<span style="color:var(--o700)">2차 ${'★'.repeat(ms2)}${'☆'.repeat(5-ms2)} ${ms2}점</span>` : ''}
  </div>`;
}).join('')}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 2차 평가자 별점 입력 추가, 승인이력/완료화면에 자기/1차/2차 별점 모두 표시 | Claude Code |
```

### DB 스키마 업데이트:
```
final_eval_scores: id, final_id, goal_id, self_score, mgr_score, second_mgr_score (추가)
```

### 핵심 설계 원칙 수정:
```
- 1차 평가자: 별점 + 등급 선택 + 종합의견
- 2차 평가자: 별점 + 종합의견 (등급 선택 없음)
- 표시: 자기★ / 1차★ / 2차★ 모두 표시
```
