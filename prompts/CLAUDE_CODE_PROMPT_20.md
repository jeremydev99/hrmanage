# Claude Code 작업 지시서 20
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_20.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 1 — 승인 이력에 자기/1차/2차 평가 결과 모두 표시 (approvals.js + server/index.js)

### 1-1. server/index.js — /api/approvals/my-history에 2차 평가 정보 추가

GET /api/approvals/my-history 라우트를 찾아서
enriched 배열의 finalData 부분에 2차 평가 정보 추가:

```javascript
let finalData = null;
if (fe) {
  const scores = db.prepare('SELECT * FROM final_eval_scores WHERE final_id=?').all(fe.id);
  // 2차 평가자 이름 조회
  const secondMgrUser = fe.second_mgr_id
    ? db.prepare('SELECT name, title FROM users WHERE id=?').get(fe.second_mgr_id)
    : null;
  // 1차 평가자 이름 조회
  const mgrUser = fe.mgr_approver_id
    ? db.prepare('SELECT name, title FROM users WHERE id=?').get(fe.mgr_approver_id)
    : null;
  finalData = {
    self_done:         fe.self_done,
    mgr_done:          fe.mgr_done,
    mgr_approver_name: mgrUser?.name || '',
    second_mgr_done:   fe.second_mgr_done,
    second_mgr_name:   secondMgrUser?.name || '',
    second_mgr_note:   fe.second_mgr_note && fe.second_mgr_done ? decrypt(fe.second_mgr_note) : null,
    final_score:       fe.final_score,
    final_grade:       fe.final_grade,
    selected_grade:    fe.selected_grade,
    mgr_note:          fe.mgr_note && fe.mgr_done ? decrypt(fe.mgr_note) : null,
    scores,
  };
}
```

### 1-2. approvals.js — 카드에 자기/1차/2차 평가 결과 모두 표시

h.final_eval 섹션을 아래로 교체:

```javascript
${h.final_eval ? `
<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--o100)">
  <div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500">최종평가 결과</div>
  
  <!-- 상태 뱃지 -->
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <span class="bd ${h.final_eval.self_done?'bd-approved':'bd-draft'}" style="font-size:11px">
      자기평가 ${h.final_eval.self_done?'완료':'미완료'}
    </span>
    <span class="bd ${h.final_eval.mgr_done?'bd-locked':'bd-pending'}" style="font-size:11px">
      1차(${h.final_eval.mgr_approver_name||'상사'}) ${h.final_eval.mgr_done?'완료':'대기'}
    </span>
    ${h.final_eval.second_mgr_done ? `
    <span class="bd bd-locked" style="font-size:11px">
      2차(${h.final_eval.second_mgr_name||''}) 완료
    </span>` : ''}
    ${h.final_eval.final_score != null
      ? `<span style="font-size:18px;font-weight:700;color:var(--o500)">${h.final_eval.final_score}점</span>
         <span class="bd bd-locked" style="font-size:13px">${h.final_eval.selected_grade||h.final_eval.final_grade||''}</span>`
      : ''}
  </div>

  <!-- 목표별 자기/상사 별점 -->
  ${(h.goals||[]).length && (h.final_eval.scores||[]).length ? `
  <div style="margin-bottom:10px">
    <div style="font-size:11px;color:var(--muted);margin-bottom:5px">목표별 평가</div>
    ${(h.goals||[]).map(g => {
      const sc = (h.final_eval.scores||[]).find(s=>String(s.goal_id)===String(g.id));
      const ss = sc?.self_score || 0;
      const ms = sc?.mgr_score  || 0;
      if (!ss && !ms) return '';
      return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--o50);flex-wrap:wrap">
        <span style="flex:1;font-size:12px;font-weight:500">${g.name||''}</span>
        ${ss ? `<span style="font-size:12px;color:var(--muted)">자기 ${'★'.repeat(ss)}${'☆'.repeat(5-ss)} ${ss}점</span>` : ''}
        ${ms ? `<span style="font-size:12px;color:var(--o500)">1차 ${'★'.repeat(ms)}${'☆'.repeat(5-ms)} ${ms}점</span>` : ''}
      </div>`;
    }).join('')}
  </div>` : ''}

  <!-- 1차 평가자 종합의견 -->
  ${h.final_eval.mgr_note ? `
  <div style="margin-bottom:8px">
    <div style="font-size:11px;color:var(--muted);margin-bottom:3px">1차(${h.final_eval.mgr_approver_name||'상사'}) 종합의견</div>
    <div style="font-size:12px;padding:8px;background:var(--o50);border-radius:6px;line-height:1.6">${h.final_eval.mgr_note}</div>
  </div>` : ''}

  <!-- 2차 평가자 종합의견 -->
  ${h.final_eval.second_mgr_note ? `
  <div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:3px">2차(${h.final_eval.second_mgr_name||''}) 종합의견</div>
    <div style="font-size:12px;padding:8px;background:var(--o50);border-radius:6px;line-height:1.6">${h.final_eval.second_mgr_note}</div>
  </div>` : ''}
</div>` : ''}
```

---

## 작업 2 — 관리자 전직원 현황에 평가 단계 강제 변경 버튼 추가 (admin.js + server/index.js)

### 2-1. server/index.js — /api/admin/eval/:evalId/force-phase API 확인 및 추가

grep으로 'force-phase' 라우트가 있는지 확인.
없으면 /api/admin/eval-status 라우트 위에 추가:

```javascript
// 평가 단계 강제 변경 (admin+)
app.post('/api/admin/eval/:evalId/force-phase', auth, adminOnly, (req, res) => {
  try {
    const { phase } = req.body;
    const validPhases = ['draft','pending','approved','rejected',
                         'final_self','final_mgr_pending','final_mgr2_pending','final_done'];
    if (!validPhases.includes(phase))
      return res.status(400).json({ error: '유효하지 않은 phase입니다.' });

    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '평가를 찾을 수 없습니다.' });

    const locked = phase === 'final_done' ? 1 : 0;
    db.prepare("UPDATE eval_cycles SET phase=?, locked=?, updated_at=datetime('now') WHERE id=?")
      .run(phase, locked, req.params.evalId);

    // final_done 시 final_evaluations도 잠금
    if (phase === 'final_done') {
      db.prepare("UPDATE final_evaluations SET locked=1, locked_at=datetime('now') WHERE eval_id=?")
        .run(req.params.evalId);
    }

    const target = db.prepare('SELECT u.name FROM eval_cycles e JOIN users u ON e.user_id=u.id WHERE e.id=?').get(req.params.evalId);
    auditLog(req.user.sub, 'FORCE_PHASE_CHANGE', req.params.evalId, target?.name,
      `평가 단계 강제 변경: ${ev.phase} → ${phase}`, req.ip);

    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

### 2-2. admin.js — renderAdmStatus 함수에 강제 변경 버튼 추가

renderAdmStatus 함수를 찾아서
각 직원 행 또는 상세 팝업에 강제 변경 버튼 추가:

전직원 현황 테이블의 각 행 마지막 열에 추가:
```javascript
// 기존 행 마지막에 버튼 추가
<button class="btn btn-ghost btn-sm" style="font-size:11px"
  onclick="showForcePhaseModal(${ev.id}, '${ev.user_name}', '${ev.phase}')">
  단계 변경
</button>
```

showForcePhaseModal 함수 추가:
```javascript
function showForcePhaseModal(evalId, userName, currentPhase) {
  document.getElementById('force-phase-modal')?.remove();
  const phases = [
    { value: 'draft',               label: '목표 작성중' },
    { value: 'pending',             label: '승인 대기' },
    { value: 'approved',            label: '목표 확정' },
    { value: 'rejected',            label: '반려됨' },
    { value: 'final_self',          label: '자기평가 중' },
    { value: 'final_mgr_pending',   label: '1차 상사평가 대기' },
    { value: 'final_mgr2_pending',  label: '2차 상사평가 대기' },
    { value: 'final_done',          label: '평가 완료 (잠금)' },
  ];
  const overlay = document.createElement('div');
  overlay.id = 'force-phase-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:12px;padding:24px;width:100%;max-width:400px;margin:20px">
      <div style="font-size:15px;font-weight:600;margin-bottom:6px">평가 단계 강제 변경</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px">${userName}</div>
      <div class="alert alert-red" style="font-size:12px;margin-bottom:14px">
        ⚠ 관리자 전용 기능입니다. 신중하게 사용하세요.
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px">변경할 단계 선택</label>
        <select id="force-phase-select" style="width:100%;height:38px;font-size:13px">
          ${phases.map(p =>
            `<option value="${p.value}" ${p.value===currentPhase?'selected':''}>${p.label}</option>`
          ).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('force-phase-modal').remove()">취소</button>
        <button class="btn btn-primary" onclick="forcePhaseChange(${evalId})">변경</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function forcePhaseChange(evalId) {
  const phase = document.getElementById('force-phase-select')?.value;
  if (!phase) return;
  if (!confirm(`정말로 평가 단계를 "${phase}"로 변경하시겠습니까?`)) return;
  try {
    await API.post('/admin/eval/' + evalId + '/force-phase', { phase });
    showAlert('평가 단계가 변경되었습니다.', 'green');
    document.getElementById('force-phase-modal')?.remove();
    renderAdmStatus();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 승인이력 자기/1차/2차 평가결과 표시, 관리자 평가단계 강제변경 버튼 추가 | Claude Code |
```

### API 목록에 추가:
```
POST /api/admin/eval/:evalId/force-phase  평가 단계 강제 변경 (admin+)
```

### 핵심 설계 원칙에 추가:
```
- 관리자 평가단계 강제변경: 전직원 현황 탭 각 행의 '단계 변경' 버튼
  → showForcePhaseModal → forcePhaseChange → POST /api/admin/eval/:id/force-phase
```
