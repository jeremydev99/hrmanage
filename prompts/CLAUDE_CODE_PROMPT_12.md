# Claude Code 작업 지시서 12
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 개요

3가지 기능 추가/수정:
1. 2차 이상 승인자가 하위 승인자의 중간 피드백 내용 열람 가능
2. 중간 피드백 화면에 목표별 별점이 시각적으로 잘 보이도록 개선
3. 최종 평가 화면에서 중간 피드백 별점 요약 표시 + 1차 평가자가 2차 평가자의 최종평가 열람 가능

---

## 작업 1 — server/index.js: 피드백 열람 권한 확장

### 1-1. GET /api/feedback/:evalId 수정

현재 피드백 내용 복호화 조건:
```javascript
fb.overall_note = (isAdmin || isOwner || fb.author_id === req.user.sub) ? decrypt(...) : null;
```

이것을 아래로 교체:
```javascript
// 승인자 체인 전체가 피드백 내용 열람 가능
// (2차 승인자는 1차 승인자 피드백도 볼 수 있어야 함)
const ev2 = db.prepare('SELECT user_id FROM eval_cycles WHERE id=?').get(req.params.evalId);
const fbChain = [];
let fbCur = ev2 ? db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(ev2.user_id)) : null;
while (fbCur?.manager_id && fbChain.length < 5) {
  fbChain.push(String(fbCur.manager_id));
  fbCur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(fbCur.manager_id));
}
const isChainApprover = fbChain.includes(String(req.user.sub));
const canReadFb = isAdmin || isOwner || isChainApprover;

fbs.forEach(fb => {
  fb.overall_note = canReadFb ? decrypt(fb.overall_note) : null;
  fb.items = db.prepare(
    'SELECT fi.*,g.name as goal_enc FROM feedback_items fi JOIN goals g ON fi.goal_id=g.id WHERE fi.feedback_id=?'
  ).all(fb.id).map(it => ({
    ...it,
    note:      canReadFb ? decrypt(it.note)      : null,
    goal_name: canReadFb ? decrypt(it.goal_enc)  : '***',
  }));
});
res.json(fbs);
```

### 1-2. GET /api/final/:evalId 수정 — 승인자도 최종평가 열람 가능

현재:
```javascript
if (isAdmin || isOwner) { fe.self_note = decrypt(fe.self_note); fe.mgr_note = decrypt(fe.mgr_note); }
else { fe.self_note = null; fe.mgr_note = null; }
```

아래로 교체:
```javascript
// 승인자 체인 전체가 최종 평가 내용 열람 가능
const finalChain = [];
let finalCur = ev ? db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(ev.user_id)) : null;
while (finalCur?.manager_id && finalChain.length < 5) {
  finalChain.push(String(finalCur.manager_id));
  finalCur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(finalCur.manager_id));
}
const isChainApprover2 = finalChain.includes(String(req.user.sub));
const canReadFinal = isAdmin || isOwner || isChainApprover2;

if (canReadFinal) {
  fe.self_note = fe.self_note ? decrypt(fe.self_note) : '';
  fe.mgr_note  = fe.mgr_note  ? decrypt(fe.mgr_note)  : '';
} else {
  fe.self_note = null;
  fe.mgr_note  = null;
}
fe.scores = db.prepare('SELECT * FROM final_eval_scores WHERE final_id=?').all(fe.id);
res.json(fe);
```

---

## 작업 2 — public/js/pages/feedback.js: 피드백 별점 UI 개선

### 2-1. 피드백 조회 화면에서 별점 시각화 개선

renderReceivedFeedback 함수와 renderGiveFeedback 함수에서
피드백 아이템의 score를 별점으로 표시하는 함수 추가.

feedback.js 맨 위(또는 함수들 위)에 아래 함수 추가:

```javascript
// 별점 표시 (읽기 전용)
function renderStars(score, size) {
  const sz = size || 16;
  const filled   = '★';
  const empty    = '☆';
  const colors   = { 5:'#F07820', 4:'#F0A020', 3:'#808080', 2:'#A0A0A0', 1:'#C0C0C0' };
  const labels   = { 5:'매우 우수', 4:'우수', 3:'보통', 2:'미흡', 1:'매우 미흡' };
  if (!score) return '<span style="color:var(--muted);font-size:12px">미평가</span>';
  const color = colors[score] || '#808080';
  const label = labels[score] || '';
  return `<span style="font-size:${sz}px;color:${color};letter-spacing:1px">${filled.repeat(score)}${empty.repeat(5-score)}</span>
          <span style="font-size:11px;color:${color};margin-left:4px;font-weight:500">${score}점 (${label})</span>`;
}

// 피드백 별점 요약 (목표별 평균)
function renderFeedbackStarSummary(feedbacks, goals) {
  if (!feedbacks || !feedbacks.length) return '';
  // 목표별 점수 모아서 평균 계산
  const scoreMap = {};
  feedbacks.forEach(fb => {
    (fb.items || []).forEach(it => {
      if (!it.score) return;
      if (!scoreMap[it.goal_id]) scoreMap[it.goal_id] = [];
      scoreMap[it.goal_id].push(it.score);
    });
  });
  if (!Object.keys(scoreMap).length) return '';

  let html = `<div style="background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:12px;margin-bottom:12px">
    <div style="font-size:13px;font-weight:600;color:var(--o800);margin-bottom:8px">📊 중간 피드백 별점 요약</div>`;

  goals.forEach(g => {
    const scores = scoreMap[g.id];
    if (!scores || !scores.length) return;
    const avg = scores.reduce((a,b) => a+b, 0) / scores.length;
    const avgRound = Math.round(avg);
    html += `<div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid var(--o100)">
      <span style="flex:1;font-size:12px;font-weight:500;color:var(--o800)">${g.name||''}</span>
      <span style="font-size:12px;color:var(--muted)">${scores.length}명 평가</span>
      ${renderStars(avgRound, 14)}
      <span style="font-size:11px;color:var(--muted)">(평균 ${avg.toFixed(1)}점)</span>
    </div>`;
  });
  html += '</div>';
  return html;
}
```

### 2-2. 피드백 조회 (받은 피드백) 화면에서 별점 개선

renderReceivedFeedback 함수에서 각 fb.items 표시 부분을 찾아서
아래 방식으로 별점을 크고 명확하게 표시:

```javascript
// 기존: it.score ? scoreLabel(it.score) : ''
// 수정: renderStars(it.score, 16)
// 그리고 목표명 표시 방식도 개선

// 피드백 카드 안에서 items 표시 부분을 아래로 교체:
const itemsHtml = fb.items?.map(it => `
  <div style="padding:8px 0;border-bottom:1px solid var(--o50)">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:4px">
      <span style="font-size:12px;font-weight:500;color:var(--o800);flex:1">${it.goal_name||'목표'}</span>
      <div>${renderStars(it.score, 15)}</div>
    </div>
    ${it.note ? `<div style="font-size:12px;color:var(--muted);padding-left:4px">${it.note}</div>` : ''}
  </div>`).join('') || '';
```

### 2-3. 피드백 작성 화면에서도 별점이 명확하게 보이도록

renderGiveFeedback 함수에서 기존 피드백 이력 표시 부분의 star 표시를
renderStars() 함수를 사용하도록 교체.

---

## 작업 3 — public/js/pages/final-eval.js: 최종 평가 화면 개선

### 3-1. 최종 평가 화면 상단에 중간 피드백 별점 요약 표시

Pages.finalEval 함수에서 eval을 로드한 후,
최종 평가 폼 위에 중간 피드백 요약 섹션 추가:

```javascript
// 중간 피드백 요약 로드
try {
  const [feedbacks, goals] = await Promise.all([
    API.get('/feedback/' + ev.id),
    API.get('/evals/' + ev.id + '/goals'),
  ]);
  if (feedbacks.length) {
    const summaryEl = document.createElement('div');
    summaryEl.innerHTML = renderFeedbackStarSummary(feedbacks, goals);
    // 최종 평가 카드 위에 삽입
    area.insertBefore(summaryEl, area.firstChild);
  }
} catch(e) {}
```

단, renderFeedbackStarSummary 함수는 feedback.js에 정의되어 있으므로
final-eval.js에서 그대로 호출 가능 (전역 함수).

만약 호출 순서 문제가 있으면 final-eval.js에도 같은 함수를 복사.

### 3-2. 1차 평가자가 2차 평가자의 최종평가 열람

현재 renderGiveFinalMgr 함수 (또는 상사가 최종평가를 입력하는 부분)에서
다른 승인자의 최종평가를 조회할 수 있는 섹션 추가.

Pages.finalEval 함수 전체 구조에서:
- 내 평가 대상 직원 목록 (reporteeEvs) 조회 시
- 각 직원의 최종 평가를 API.get('/final/' + ev.id)로 로드
- mgr_note, mgr_done, final_score, final_grade가 있으면 표시
- 서버에서 이미 1번 수정에서 승인자 체인 전체 열람 허용했으므로 별도 API 수정 불필요

Pages.finalEval 함수 안 reporteeEvs 부분에서
각 카드에 아래 섹션 추가:

```javascript
// 해당 직원의 최종 평가 결과 조회
const fe = await API.get('/final/' + ev.id).catch(() => null);

if (fe && (fe.mgr_done || fe.final_score)) {
  const refSection = document.createElement('div');
  refSection.style.cssText = 'background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:12px;margin-top:10px';
  refSection.innerHTML = `
    <div style="font-size:12px;font-weight:600;color:var(--o700);margin-bottom:8px">📋 최종 평가 결과</div>
    ${fe.final_score != null
      ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
           <span style="font-size:20px;font-weight:700;color:var(--o500)">${fe.final_score}점</span>
           <span class="grade grade-${fe.final_grade}" style="font-size:16px">${fe.final_grade}</span>
         </div>` : ''}
    ${fe.mgr_note
      ? `<div style="font-size:13px;color:var(--o800);line-height:1.6;white-space:pre-wrap">${fe.mgr_note}</div>`
      : ''}
    ${!fe.mgr_done ? '<div style="font-size:12px;color:var(--muted)">상사 평가 진행 중...</div>' : ''}`;
  card.appendChild(refSection);
}
```

---

## 작업 4 — 중간 피드백 탭에서 다른 승인자 피드백도 구분하여 표시

### renderGiveFeedback 함수에서 피드백 이력 표시 부분 개선

각 직원 카드에서 기존 피드백 목록을 표시할 때,
작성자 정보(author_name)와 함께 누가 작성한 피드백인지 구분:

```javascript
// 피드백 이력 카드에서
reports.map((fb, i) => {
  const isMyFb = String(fb.author_id) === String(App.user.id);
  return `<div class="fb-entry" style="${isMyFb ? '' : 'background:var(--bg);border-left:3px solid var(--o200)'}">
    <div class="fb-meta">
      <span class="bd ${isMyFb ? 'bd-approved' : 'bd-draft'}">${fb.author_name} ${isMyFb ? '(내 피드백)' : ''}</span>
      <span>${(fb.created_at||'').slice(0,16).replace('T',' ')}</span>
    </div>
    <!-- 별점 및 의견 표시 -->
    ${fb.items?.length ? fb.items.map(it => `
      <div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px">
        <span style="flex:1;color:var(--o800)">${it.goal_name||''}</span>
        ${renderStars(it.score, 14)}
        ${it.note ? '<span style="color:var(--muted)">— ' + it.note + '</span>' : ''}
      </div>`).join('') : ''}
    ${fb.overall_note ? `<div style="font-size:13px;margin-top:6px;padding-top:6px;border-top:1px solid var(--o100);color:var(--o800)">${fb.overall_note}</div>` : ''}
  </div>`;
}).join('')
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

1. "핵심 설계 원칙"에 추가:
```
11. 피드백 열람: 승인자 체인 전체가 하위 승인자의 피드백 열람 가능
12. 최종평가 열람: 승인자 체인 전체가 열람 가능 (작성은 1차 직속 상사만)
13. 중간 피드백 별점: 목표별 1~5점, 최종평가 화면에서 요약 표시
```

2. "개발 이력"에 추가:
```
| 오늘날짜 | 피드백열람권한확장(체인전체), 별점시각화개선, 최종평가상호열람, 중간피드백별점요약 | Claude Code |
```
