# Claude Code 작업 지시서 15
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_15.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 1 — final-eval.js: 상사 최종평가 등급 선택 확인 및 수정

### 1-1. renderFinalMgr 함수에서 grades 로드 확인

`public/js/pages/final-eval.js` 파일을 열어서
renderFinalMgr 함수 안의 Promise.all을 찾아라.

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

### 1-2. bottomSection에 등급 선택 UI 확인

bottomSection.innerHTML 안에 `fin-grade-sel-` select가 있는지 확인.

없으면 종합의견 textarea 위에 아래 추가:
```javascript
${!ev.is_second && grades.length ? `
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
```

등급 선택 시 설명 표시 이벤트 리스너도 추가 (body.appendChild(bottomSection) 바로 다음):
```javascript
// 등급 선택 시 설명 표시
setTimeout(() => {
  const sel   = document.getElementById('fin-grade-sel-' + ev.id);
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
```

### 1-3. submitFinalMgr 함수 확인

`submitFinalMgr` 함수에서 1차 평가자 제출 부분에 아래가 있는지 확인:

```javascript
// 등급 선택 검증
const selectedGrade = document.getElementById(`fin-grade-sel-${evalId}`)?.value || '';
const sel = document.getElementById(`fin-grade-sel-${evalId}`);
if (sel && !selectedGrade) {
  showAlert('최종 등급을 선택해주세요.', 'orange');
  return;
}

// API 호출 시 selected_grade 포함
const res = await API.post(`/final/${evalId}/mgr`, {
  mgr_note: note,
  scores,
  selected_grade: selectedGrade,
});
```

없으면 추가.

---

## 작업 2 — server/index.js: selected_grade 저장 확인 및 수정

### 2-1. migrations 배열 확인

`server/index.js`를 열어서 migrations 배열에
아래가 있는지 확인:
```javascript
"ALTER TABLE final_evaluations ADD COLUMN selected_grade TEXT",
```
없으면 추가.

### 2-2. POST /api/final/:evalId/mgr 확인

1차 평가자 제출 처리 부분에서:

```javascript
const { mgr_note, scores, selected_grade } = req.body;
```
로 selected_grade를 받고 있는지 확인. 없으면 추가.

UPDATE 쿼리에 selected_grade 포함 확인:
```javascript
db.prepare(`UPDATE final_evaluations
  SET mgr_note=?, mgr_done=1, mgr_done_at=datetime('now'),
      mgr_approver_id=?, final_score=?, final_grade=?,
      selected_grade=?
  WHERE id=?`)
  .run(encrypt(mgr_note||''), req.user.sub, finalScore,
       finalGradeCode, selected_grade||finalGradeCode, fe.id);
```
없으면 수정.

### 2-3. GET /api/final/:evalId 확인

response에 selected_grade가 포함되어 반환되는지 확인.
`SELECT *`로 조회하면 자동 포함되므로 별도 수정 불필요.
단, selected_grade 컬럼이 없어서 오류가 날 경우 migrations에 추가 후 재시작.

---

## 작업 3 — 최종평가 완료 화면에 선택된 등급 표시

### final-eval.js — renderFinalSelf 함수의 final_done 화면

`ev.phase === 'final_done'` 처리 부분에서
현재 등급 표시가 `S/A/B/C/D` 점수 기반으로만 되어 있으면,
`fe.selected_grade` 또는 `fe.final_grade`를 우선 표시하도록 수정:

```javascript
// 기존: grade 변수를 점수로 계산
// 수정: selected_grade가 있으면 우선 사용
const displayGrade = fe?.selected_grade || fe?.final_grade || grade;

// 화면 표시 시 displayGrade 사용
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 상사최종평가 등급선택 드롭다운 추가, selected_grade DB저장, 완료화면 등급표시 | Claude Code |
```

### 핵심 설계 원칙에 추가/확인:
```
- 최종평가 등급: 상사가 grade_criteria에서 선택, selected_grade로 저장
  (점수 기반 자동 등급과 별도로 관리)
- 2차 평가자는 등급 선택 없이 의견만 작성
```

### DB 스키마 업데이트:
```
final_evaluations: ... selected_grade TEXT (추가)
```
