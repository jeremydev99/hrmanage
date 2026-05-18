# Claude Code 작업 지시서 17
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_17.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 목표: 2차 최종평가 순서 제어 완성

### 올바른 프로세스
```
자기평가 제출
  → phase: final_mgr_pending  (1차 평가자에게 표시)
1차 평가자 제출 + 2차설정 켜짐 + 2차평가자 존재
  → phase: final_mgr2_pending (2차 평가자에게 표시)
  → 1차 평가자 화면: 완료 상태로 전환 (버튼 사라짐) ✅ 이미 됨
2차 평가자 제출
  → phase: final_done, locked=1
1차 평가자 제출 + 2차설정 꺼짐 또는 2차평가자 없음
  → phase: final_done, locked=1 (바로 종료)
```

---

## 작업 1 — server/index.js 확인 및 수정

### 1-1. POST /api/final/:evalId/mgr 전체 로직 확인

파일을 열어서 `app.post('/api/final/:evalId/mgr'` 라우트를 찾아라.

**확인 1: 2차 평가자 판단 로직**
- `isSecond` 변수가 올바르게 판단되는지 확인
- dev3(한개발)의 직속 상사는 dev2(정개발), dev2의 상사는 dev1(최개발), dev1의 상사는 CEO
- CEO가 dev3 평가 제출 시 → isSecond=true 로 처리되는지 확인

**확인 2: 1차 평가자 제출 후 phase 전환**
```javascript
// 2차 평가자가 있는지 확인 로직
const directMgrUser = targetUser?.manager_id
  ? db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(targetUser.manager_id))
  : null;
if (directMgrUser?.manager_id) {
  // 2차 평가자 있음 → final_mgr2_pending
} else {
  // 2차 평가자 없음 → final_done
}
```
이 로직이 있는지 확인. 없으면 추가.

**확인 3: 2차 평가자 제출 처리**
```javascript
if (isSecond) {
  // 1차가 완료됐는지 확인
  if (!fe.mgr_done) return res.status(400).json({ error: '1차 평가자가 먼저 평가를 완료해야 합니다.' });
  
  db.prepare(`UPDATE final_evaluations
    SET second_mgr_note=?, second_mgr_done=1,
        second_mgr_done_at=datetime('now'), second_mgr_id=?
    WHERE id=?`)
    .run(encrypt(mgr_note||''), req.user.sub, fe.id);
  
  db.prepare(`UPDATE eval_cycles
    SET phase='final_done', locked=1, updated_at=datetime('now')
    WHERE id=?`).run(ev.id);
  
  db.prepare(`UPDATE final_evaluations
    SET locked=1, locked_at=datetime('now')
    WHERE id=?`).run(fe.id);
}
```
이 로직이 있는지 확인. 없으면 추가.

### 1-2. GET /api/evals/my-mgr-pending 확인

2차 평가자에게 `final_mgr2_pending` 상태의 eval이 표시되는지 확인.

```sql
-- 2차 평가자용 쿼리 (1차가 완료된 경우만)
WHERE e.phase IN ('final_mgr2_pending')
AND fe.mgr_done = 1
AND u.manager_id IN (SELECT id FROM users WHERE manager_id=?)
```

이 쿼리가 있는지 확인. 없으면 추가.

---

## 작업 2 — final-eval.js 확인 및 수정

### 2-1. 2차 평가자 UI 확인

renderFinalMgr 함수에서 `ev.is_second` 값에 따라:
- **1차 평가자**: 별점 입력 + 등급 선택 + 종합의견 → '최종 평가 확정' 버튼
- **2차 평가자**: 종합의견만 → '2차 최종평가 제출' 버튼 (별점/등급 입력 없음)

2차 평가자 카드에서 별점 입력 섹션과 등급 선택이 표시되지 않는지 확인.
표시된다면 `ev.is_second` 조건으로 감싸서 숨기기.

### 2-2. submitFinalMgr 함수 확인

```javascript
async function submitFinalMgr(evalId, isSecond) {
  // 2차 평가자는 별점/등급 없이 의견만 제출
  if (isSecond) {
    const note = document.getElementById(`fin-mgr-note-${evalId}`)?.value || '';
    try {
      await API.post(`/final/${evalId}/mgr`, { mgr_note: note, scores: [], is_second: true });
      showAlert('2차 최종평가가 제출되었습니다.', 'green');
      setTimeout(() => Pages.finalEval(), 1000);
    } catch(e) { showAlert(e.message, 'red'); }
    return;
  }
  // 1차 평가자: 별점 + 등급 필수
  ...
}
```

`is_second: true` 가 API 호출에 포함되는지 확인. 없으면 추가.

### 2-3. 서버에서 is_second 수신 확인 (server/index.js)

POST /api/final/:evalId/mgr 에서:
```javascript
const { mgr_note, scores, selected_grade, is_second } = req.body;
```
`is_second`를 req.body에서 받고 있는지 확인.

만약 is_second를 req.body로 받지 않고 DB 조직도로만 판단한다면 그대로 유지.

---

## 작업 3 — 2차 평가 설정 켜짐/꺼짐 시나리오 테스트 가이드

아래 시나리오로 테스트해줘 (실제 테스트는 사람이 하지만 로직 검토):

**시나리오 A: 2차 설정 꺼짐**
```
dev3 자기평가 제출 → phase: final_mgr_pending
dev2(1차) 평가 제출 → phase: final_done (바로 종료)
```

**시나리오 B: 2차 설정 켜짐**
```
dev3 자기평가 제출 → phase: final_mgr_pending
dev2(1차) 평가 제출 → phase: final_mgr2_pending
dev1(2차) 평가 제출 → phase: final_done
```

**시나리오 C: 2차 설정 켜짐 + CEO가 2차**
```
dev3 자기평가 제출 → phase: final_mgr_pending
dev2(1차) 평가 제출 → phase: final_mgr2_pending
CEO(2차) 평가 제출 → phase: final_done
```

각 시나리오에서 서버 로직이 올바르게 동작하는지 코드 레벨에서 검토.
문제가 있으면 수정.

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 2차최종평가 순서제어 완성 (1차완료→2차활성화, phase전환, 잠금처리) | Claude Code |
```

### 핵심 설계 원칙 확인/추가:
```
- 2차 최종평가 순서:
  1차(직속상사) 완료 → phase: final_mgr2_pending → 2차 평가자에게만 표시
  2차 완료 → phase: final_done, locked=1
- 2차 설정 꺼짐 시: 1차 완료 즉시 final_done
- 2차 평가자 UI: 종합의견만 작성 (별점/등급 입력 없음)
```
