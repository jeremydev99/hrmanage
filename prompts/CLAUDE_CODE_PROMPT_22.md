# Claude Code 작업 지시서 22
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_22.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 목표: 최종평가 잠금 해제 시 올바른 상태로 초기화

### 현재 문제
관리자가 최종평가 잠금을 해제해도:
- `self_done=1` 그대로 → dev3 화면에 '제출 완료' 잠금 상태
- `mgr_done=1` 그대로 → 상사 평가 완료 상태 유지
- `phase='approved'` → 최종평가 단계가 아닌 목표확정 단계로 표시

### 올바른 동작
잠금 해제 시:
```
phase → 'final_self' (자기평가 다시 작성 가능)
locked → 0
self_done → 0 (자기평가 재작성 가능)
mgr_done → 0 (상사평가 초기화)
second_mgr_done → 0 (2차 초기화)
locked_at → null
```

---

## 작업 1 — server/index.js: POST /api/admin/final/:id/unlock 수정

해당 라우트를 찾아서 아래로 교체:

```javascript
app.post('/api/admin/final/:id/unlock', auth, masterOnly, (req, res) => {
  try {
    const fe = db.prepare('SELECT * FROM final_evaluations WHERE id=?').get(req.params.id);
    if (!fe) return res.status(404).json({ error: '최종평가를 찾을 수 없습니다.' });

    // final_evaluations 초기화
    db.prepare(`UPDATE final_evaluations
      SET locked=0, locked_at=NULL,
          self_done=0, self_done_at=NULL,
          mgr_done=0, mgr_done_at=NULL,
          mgr_approver_id=NULL,
          second_mgr_done=0, second_mgr_done_at=NULL,
          second_mgr_id=NULL,
          final_score=NULL, final_grade=NULL, selected_grade=NULL
      WHERE id=?`).run(req.params.id);

    // eval_cycles phase → final_self, locked=0
    db.prepare(`UPDATE eval_cycles
      SET phase='final_self', locked=0, updated_at=datetime('now')
      WHERE id=?`).run(fe.eval_id);

    // final_eval_scores 초기화 (별점 초기화)
    db.prepare(`UPDATE final_eval_scores
      SET mgr_score=NULL, second_mgr_score=NULL
      WHERE final_id=?`).run(req.params.id);

    // 감사 로그
    const ev = db.prepare('SELECT user_id, period_label FROM eval_cycles WHERE id=?').get(fe.eval_id);
    const target = ev ? db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id) : null;
    auditLog(req.user.sub, 'FINAL_EVAL_UNLOCKED', fe.eval_id, target?.name,
      `최종평가 잠금 해제 및 초기화 (${ev?.period_label||''})`, req.ip);

    res.json({ success: true });
  } catch(err) {
    console.error('[unlock]', err);
    res.status(500).json({ error: err.message });
  }
});
```

---

## 작업 2 — admin.js: 잠금 해제 버튼 확인

renderAdmStatus 함수에서 잠금 해제 버튼이 있는지 확인.
없으면 final_done 상태인 직원 행에 추가:

```javascript
${ev.phase === 'final_done' && App.isMaster() ? `
<button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;font-size:11px;padding:4px 8px"
  onclick="unlockFinalEval(${ev.final_eval_id}, '${ev.user_name}')">
  🔓 잠금 해제
</button>` : ''}
```

unlockFinalEval 함수 추가:
```javascript
async function unlockFinalEval(finalId, userName) {
  if (!confirm(`${userName}의 최종평가 잠금을 해제하시겠습니까?\n자기평가와 상사평가가 모두 초기화됩니다.`)) return;
  try {
    await API.post('/admin/final/' + finalId + '/unlock', {});
    showAlert(`${userName}의 최종평가가 초기화되었습니다.`, 'green');
    renderAdmStatus();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 작업 3 — final-eval.js: 잠금 해제 후 자기평가 재작성 가능 확인

GET /api/final/:evalId 에서 self_done=0이면
자기평가 입력 폼이 다시 표시되는지 확인.

현재 코드에서:
```javascript
if (fe?.self_done) {
  // 잠금 화면 표시
  return;
}
// 자기평가 입력 폼 표시
```

이 분기가 올바르게 동작하는지 확인.
self_done=0이면 입력 폼이 표시되어야 함. 이미 정상이면 수정 불필요.

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 최종평가 잠금해제 시 self_done/mgr_done/별점 완전 초기화, phase=final_self로 복구 | Claude Code |
```

### 핵심 설계 원칙 추가:
```
- 최종평가 잠금 해제(master만 가능):
  self_done=0, mgr_done=0, second_mgr_done=0, locked=0
  final_score=null, final_grade=null, selected_grade=null
  별점(mgr_score, second_mgr_score) 초기화
  phase='final_self'로 복구 → 자기평가부터 다시 작성
```
