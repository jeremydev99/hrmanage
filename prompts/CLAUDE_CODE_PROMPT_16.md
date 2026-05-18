# Claude Code 작업 지시서 16
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_16.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 문제 1 — 뱃지 표시 오류 (final-eval.js)

### 현상
CEO 상사 최종평가 화면에서:
- 오영업 카드: '최종평가 대기' (주황)
- 한개발 카드: '2차평가 대기' (보라)
→ CEO 입장에서는 둘 다 자신이 최종 평가자인데 뱃지가 다르게 표시됨

### 원인
현재 뱃지 코드:
```javascript
<span class="bd ${ev.phase==='final_mgr2_pending'?'bd-purple':'bd-final'}" style="font-size:11px">
  ${ev.phase==='final_mgr2_pending'?'2차평가 대기':'최종평가 대기'}
</span>
```
→ phase만 보고 뱃지를 결정하는데, CEO가 2차 평가자여도 자신에게는 '최종평가 대기'가 맞음

### 수정
`public/js/pages/final-eval.js` 의 renderFinalMgr 함수에서
카드 헤더의 뱃지 부분을 아래로 교체:

```javascript
// 이 평가자가 1차인지 2차인지 판단
// is_second가 1이고 phase가 final_mgr2_pending이면 2차
// 그 외는 모두 '최종평가 대기'
const badge = (ev.is_second && ev.phase === 'final_mgr2_pending')
  ? { cls: 'bd-purple', text: '2차 최종평가 대기' }
  : { cls: 'bd-final',  text: '최종평가 대기' };
```

그리고 뱃지 HTML을:
```javascript
<span class="bd ${badge.cls}" style="font-size:11px">${badge.text}</span>
```
로 교체.

---

## 문제 2 — 평가 완료 후 버튼이 계속 활성화 (final-eval.js)

### 현상
dev1이 dev3 최종평가를 제출한 후에도
'최종 평가 확정 — 잠금 처리됩니다' 버튼이 계속 활성화되어 있어
재제출이 가능한 상태

### 원인
renderFinalMgr 함수에서 fe(final_evaluations)를 로드하지만,
`fe.mgr_done === 1`인 경우 버튼 폼 대신 완료 상태를 보여주는 로직이 없음

### 수정
`public/js/pages/final-eval.js` 의 renderFinalMgr 함수에서
body 영역을 만들기 전에 아래 분기 추가:

```javascript
// ── 1차 평가 이미 완료된 경우 — 잠금 상태 표시 ──────────
if (fe?.mgr_done && !ev.is_second) {
  // 완료 상태 표시 (버튼 없음)
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
  continue; // 다음 ev로 넘어감 (버튼 폼 렌더 건너뜀)
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
```

이 코드를 `body.appendChild(fbSummary)` 이전, 즉 body 생성 직후에 삽입.

---

## 문제 3 — my-mgr-pending API에서 final_done도 포함 (server/index.js)

### 현상
평가가 완료(`final_done`)되면 my-mgr-pending에서 사라져야 하는데
완료 후에도 계속 목록에 남아있을 수 있음

### 수정
`server/index.js` 의 `/api/evals/my-mgr-pending` GET 라우트에서
1차 직속 부하 쿼리:

```sql
WHERE e.phase IN ('final_mgr_pending','final_mgr2_pending','final_done')
AND u.manager_id=?
```

`final_done`을 제거하고:
```sql
WHERE e.phase IN ('final_mgr_pending','final_mgr2_pending')
AND u.manager_id=?
```

으로 수정.

단, fe.mgr_done=1인 경우는 화면에서 완료 상태로 보여주므로
목록에 포함되어도 괜찮음. 선택적으로 수정.

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 최종평가 뱃지 오류 수정, mgr_done 완료 후 잠금 표시, 재제출 방지 | Claude Code |
```

### 핵심 설계 원칙 확인/추가:
```
- 상사 최종평가 완료(mgr_done=1) 후: 버튼 사라지고 완료 상태(점수+등급+별점) 표시
- 2차 최종평가 완료(second_mgr_done=1) 후: 완료 메시지 표시
- 뱃지: is_second=1이고 phase=final_mgr2_pending인 경우만 '2차 최종평가 대기'
  그 외 모든 경우 '최종평가 대기'
```
