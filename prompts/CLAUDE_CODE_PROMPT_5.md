# Claude Code 작업 지시서 — 관리자 평가 단계 강제 변경 기능
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]

---

## 개요

관리자(master/admin)가 전직원 평가 현황 상세 화면에서
특정 직원의 평가 phase를 강제로 변경할 수 있는 기능 추가.
조직도 변경, 데이터 오류 등 예외 상황 발생 시 사용.

---

## 작업 1 — server/index.js: 강제 변경 API 추가

GET /api/admin/audit 라우트 바로 위에 아래 코드 삽입:

```javascript
// 관리자 평가 단계 강제 변경 (master/admin)
app.post('/api/admin/eval/:evalId/force-phase', auth, adminOnly, (req, res) => {
  try {
    const { phase } = req.body;
    const validPhases = ['draft','pending','approved','rejected','final_self','final_mgr_pending','final_done'];
    if (!validPhases.includes(phase))
      return res.status(400).json({ error: '유효하지 않은 단계입니다.' });

    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '평가를 찾을 수 없습니다.' });

    const oldPhase = ev.phase;

    // phase 변경
    db.prepare("UPDATE eval_cycles SET phase=?, updated_at=datetime('now') WHERE id=?")
      .run(phase, req.params.evalId);

    // goals status도 phase에 맞게 동기화
    const goalStatus = {
      draft:             'draft',
      pending:           'pending',
      approved:          'approved',
      rejected:          'draft',
      final_self:        'approved',
      final_mgr_pending: 'approved',
      final_done:        'approved',
    };
    db.prepare("UPDATE goals SET status=? WHERE eval_id=?")
      .run(goalStatus[phase] || 'draft', req.params.evalId);

    // approved로 변경 시 approved_at 설정
    if (phase === 'approved' && !ev.approved_at) {
      db.prepare("UPDATE eval_cycles SET approved_at=datetime('now') WHERE id=?")
        .run(req.params.evalId);
    }

    // 감사 로그
    const targetUser = db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id);
    auditLog(
      req.user.sub,
      'ADMIN_FORCE_PHASE',
      ev.user_id,
      targetUser?.name,
      `평가 단계 강제 변경: ${oldPhase} → ${phase} (평가ID: ${req.params.evalId}, 기간: ${ev.period_label||''})`,
      req.ip
    );

    res.json({ success: true, old_phase: oldPhase, new_phase: phase });
  } catch(err) {
    console.error('[force-phase]', err);
    res.status(500).json({ error: err.message });
  }
});
```

---

## 작업 2 — public/js/pages/admin.js: 상세 화면에 강제 변경 UI 추가

renderEvalDetail 함수 안에서 상단 헤더 부분
(backBtn과 이름/상태 표시 div 아래)에 아래 UI를 추가해줘.

renderEvalDetail 함수 안에서 `el.innerHTML = \`...\`` 로 HTML을 만드는 부분 중
맨 위 헤더 섹션 끝에 (첫 번째 카드 div 시작 전) 아래를 추가:

```javascript
// 관리자 강제 변경 패널 (master/admin만)
const forcePanel = document.createElement('div');
forcePanel.className = 'card';
forcePanel.style.cssText = 'border:1.5px solid #FAC775;background:#FAEEDA;margin-bottom:10px';

const phaseOptions = [
  { value:'draft',             label:'작성중 (draft)'              },
  { value:'pending',           label:'승인 대기 (pending)'         },
  { value:'approved',          label:'목표 확정 (approved)'        },
  { value:'rejected',          label:'반려됨 (rejected)'           },
  { value:'final_self',        label:'자기평가 중 (final_self)'    },
  { value:'final_mgr_pending', label:'상사평가 대기'               },
  { value:'final_done',        label:'평가 완료 (final_done)'      },
];

forcePanel.innerHTML = `
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    <span style="font-size:12px;font-weight:600;color:#633806">⚠ 관리자 강제 변경</span>
    <select id="force-phase-select" style="height:30px;font-size:12px;flex:1;min-width:180px">
      ${phaseOptions.map(p =>
        `<option value="${p.value}" ${d.eval.phase === p.value ? 'selected' : ''}>${p.label}</option>`
      ).join('')}
    </select>
    <button class="btn btn-sm" style="background:#854F0B;color:#fff;border:none;height:30px"
      onclick="forcePhaseChange(${d.eval.id}, '${d.user.name}')">
      강제 변경
    </button>
    <span style="font-size:11px;color:#633806">현재: <strong>${d.eval.phase}</strong></span>
  </div>
  <div style="font-size:11px;color:#854F0B;margin-top:6px">
    ※ 조직도 변경·데이터 오류 등 예외 상황에만 사용하세요. 모든 변경은 감사 로그에 기록됩니다.
  </div>`;

// el의 맨 앞(backBtn 다음)에 삽입
// el.innerHTML 방식이면 아래처럼 forcePanel HTML을 문자열로 삽입
```

위 방식 대신, renderEvalDetail 함수가 DOM 방식이든 innerHTML 방식이든
실제 코드 구조에 맞게 forcePanel을 el의 상단(헤더 div 바로 아래)에 삽입해줘.

그리고 아래 함수를 admin.js에 추가:

```javascript
async function forcePhaseChange(evalId, userName) {
  const select = document.getElementById('force-phase-select');
  if (!select) return;
  const newPhase = select.value;

  const phaseLabels = {
    draft:'작성중', pending:'승인 대기', approved:'목표 확정',
    rejected:'반려됨', final_self:'자기평가 중',
    final_mgr_pending:'상사평가 대기', final_done:'평가 완료'
  };

  if (!confirm(
    `[주의] ${userName}의 평가 단계를\n` +
    `"${phaseLabels[newPhase]}(${newPhase})"으로 강제 변경합니다.\n\n` +
    `이 작업은 감사 로그에 기록됩니다.\n계속하시겠습니까?`
  )) return;

  try {
    const res = await API.post(`/admin/eval/${evalId}/force-phase`, { phase: newPhase });
    showAlert(
      `${userName}의 평가 단계가 "${phaseLabels[res.old_phase]}" → "${phaseLabels[res.new_phase]}"로 변경되었습니다.`,
      'green'
    );
    // 화면 새로고침
    setTimeout(() => renderAdmStatus(), 800);
  } catch(e) {
    showAlert('변경 실패: ' + e.message, 'red');
  }
}
```

---

## 작업 3 — ACTION_LABELS에 ADMIN_FORCE_PHASE 추가

admin.js의 ACTION_LABELS 객체에 아래 항목 추가:

```javascript
ADMIN_FORCE_PHASE: { text:'단계 강제변경', cls:'bd-pending' },
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

1. "미완성 기능" 섹션에서 아래 [x] 처리:
   - 관리자 평가 단계 강제 변경 기능

2. "API 엔드포인트 목록"에 추가:
   ```
   POST /api/admin/eval/:evalId/force-phase   평가 단계 강제 변경 (admin+)
   ```

3. "개발 이력"에 추가:
   ```
   | 오늘날짜 | 관리자 평가 단계 강제 변경 기능 추가 (전직원현황 상세화면) | Claude Code |
   ```
