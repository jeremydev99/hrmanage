# CLAUDE_CODE_PROMPT_44-B.md

## 작업 개요

PROMPT 44에서 도입한 FinalEvaluation Repository를 활용하여 **관리자용 force-phase, unlock 라우터 2개를 Repository Pattern으로 전환**.

| 라우터 | 변경 내용 | 위험도 |
|--------|----------|--------|
| `POST /api/admin/eval/:evalId/force-phase` | eval_cycles + final_evaluations 갱신 → Repository 호출 | 중 |
| `POST /api/admin/final/:id/unlock` | final_evaluations 초기화 + eval_cycles phase 복원 + 별점 초기화 → Repository 호출 | 중 |

**원칙**: 기능 동작은 기존과 100% 동일 유지. 검증 로직 강화는 별도 BUG로 분리.

**위험도**: 중 (관리자 권한 라우터, 데이터 정합성에 영향)

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `server/repositories/EvalCycleRepository.js` | `updatePhaseAndLocked` 메서드 인터페이스 추가 |
| `server/adapters/prisma/PrismaEvalCycleRepository.js` | 위 메서드 구현 |
| `server/repositories/FinalEvaluationRepository.js` | `resetForUnlock` 메서드 인터페이스 추가 |
| `server/adapters/prisma/PrismaFinalEvaluationRepository.js` | 위 메서드 구현 (트랜잭션) |
| `server/config/repository-factory.js` | EvalCycleRepository 이미 있으면 추가 작업 없음, 없으면 추가 |
| `server/index.js` | 두 라우터 전환 (기존 코드는 주석 처리, 롤백 대비) |

---

## (1) EvalCycleRepository.js — 인터페이스 메서드 추가

기존 메서드 목록 아래에 다음 한 메서드 추가:

```javascript
/**
 * 평가 단계 + 잠금 상태를 동시에 변경 (force-phase용)
 * @param {number} id - eval_cycles.id
 * @param {string} phase - 변경할 phase 값
 * @param {number} locked - 0 또는 1
 */
async updatePhaseAndLocked(id, phase, locked) {
  throw new Error('Not implemented');
}
```

---

## (2) PrismaEvalCycleRepository.js — 메서드 구현

기존 `reopen` 메서드 다음에 추가:

```javascript
async updatePhaseAndLocked(id, phase, locked) {
  await this.prisma.evalCycle.update({
    where: { id: Number(id) },
    data: {
      phase,
      locked:     Number(locked),
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    }
  });
}
```

---

## (3) FinalEvaluationRepository.js — 인터페이스 메서드 2개 추가

기존 메서드 목록 아래에 다음 추가:

```javascript
/**
 * 최종평가 잠금 해제 및 초기화 (unlock용)
 * final_evaluations의 모든 진행 필드를 초기 상태로 되돌리고
 * final_eval_scores의 mgr_score, second_mgr_score를 NULL로 초기화
 * @param {number} finalId - final_evaluations.id
 */
async resetForUnlock(finalId) {
  throw new Error('Not implemented');
}

/**
 * id로 최종평가 단건 조회 (eval_id가 아닌 id 기준 — unlock에서 사용)
 * @param {number} id - final_evaluations.id
 */
async findById(id) {
  throw new Error('Not implemented');
}
```

---

## (4) PrismaFinalEvaluationRepository.js — 메서드 2개 구현

기존 `upsertScores` 메서드 다음에 추가:

```javascript
async findById(id) {
  const fe = await this.prisma.finalEvaluation.findUnique({
    where: { id: Number(id) },
    include: { scores: true }
  });
  return this._flatten(fe);
}

async resetForUnlock(finalId) {
  await this.prisma.$transaction(async (tx) => {
    // final_evaluations 완전 초기화
    await tx.finalEvaluation.update({
      where: { id: Number(finalId) },
      data: {
        locked: 0,
        locked_at: null,
        selfDone: 0,
        self_done_at: null,
        mgrDone: 0,
        mgr_done_at: null,
        mgrApproverId: null,
        secondMgrDone: 0,
        second_mgr_done_at: null,
        secondMgrId: null,
        finalScore: null,
        finalGrade: null,
        selectedGrade: null,
      }
    });
    // 별점 초기화 (mgr_score, second_mgr_score만 NULL — self_score는 보존)
    await tx.finalEvalScore.updateMany({
      where: { finalId: Number(finalId) },
      data: { mgrScore: null, secondMgrScore: null }
    });
  });
}
```

---

## (5) server/index.js — force-phase 라우터 전환

**파일 상단의 require 부분 확인**: 다음이 이미 있는지 확인. 없으면 추가:

```javascript
// 파일 상단 require 영역 — 이미 있을 가능성 높음
const { getEvalCycleRepository, getFinalEvaluationRepository } = require('./config/repository-factory');
```

그리고 적절한 위치에서 인스턴스 획득 (이미 있을 가능성):
```javascript
const evalCycleRepo = getEvalCycleRepository();
const finalRepo = getFinalEvaluationRepository();
```

**기존 force-phase 라우터 (검색용)**:

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

**변경 후**:

기존 라우터를 다음과 같이 통째로 교체. **기존 코드는 바로 위에 주석으로 보존(롤백 대비)**:

```javascript
// [PROMPT_44-B] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.post('/api/admin/eval/:evalId/force-phase', auth, adminOnly, (req, res) => {
//   try {
//     const { phase } = req.body;
//     const validPhases = ['draft','pending','approved','rejected',
//                          'final_self','final_mgr_pending','final_mgr2_pending','final_done'];
//     if (!validPhases.includes(phase))
//       return res.status(400).json({ error: '유효하지 않은 phase입니다.' });
//     const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
//     if (!ev) return res.status(404).json({ error: '평가를 찾을 수 없습니다.' });
//     const locked = phase === 'final_done' ? 1 : 0;
//     db.prepare("UPDATE eval_cycles SET phase=?, locked=?, updated_at=datetime('now') WHERE id=?")
//       .run(phase, locked, req.params.evalId);
//     if (phase === 'final_done') {
//       db.prepare("UPDATE final_evaluations SET locked=1, locked_at=datetime('now') WHERE eval_id=?")
//         .run(req.params.evalId);
//     }
//     const target = db.prepare('SELECT u.name FROM eval_cycles e JOIN users u ON e.user_id=u.id WHERE e.id=?').get(req.params.evalId);
//     auditLog(req.user.sub, 'FORCE_PHASE_CHANGE', req.params.evalId, target?.name,
//       `평가 단계 강제 변경: ${ev.phase} → ${phase}`, req.ip);
//     res.json({ success: true });
//   } catch(err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// [PROMPT_44-B] Repository Pattern 적용
app.post('/api/admin/eval/:evalId/force-phase', auth, adminOnly, async (req, res) => {
  try {
    const { phase } = req.body;
    const validPhases = ['draft','pending','approved','rejected',
                         'final_self','final_mgr_pending','final_mgr2_pending','final_done'];
    if (!validPhases.includes(phase))
      return res.status(400).json({ error: '유효하지 않은 phase입니다.' });

    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '평가를 찾을 수 없습니다.' });

    const locked = phase === 'final_done' ? 1 : 0;
    await evalCycleRepo.updatePhaseAndLocked(req.params.evalId, phase, locked);

    if (phase === 'final_done') {
      await finalRepo.upsert(req.params.evalId, {
        locked: 1,
        locked_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
    }

    // 감사 로그용 사용자 정보 조회 (target name)
    const target = db.prepare('SELECT u.name FROM eval_cycles e JOIN users u ON e.user_id=u.id WHERE e.id=?').get(req.params.evalId);
    auditLog(req.user.sub, 'FORCE_PHASE_CHANGE', req.params.evalId, target?.name,
      `평가 단계 강제 변경: ${ev.phase} → ${phase}`, req.ip);

    res.json({ success: true });
  } catch(err) {
    console.error('[force-phase]', err);
    res.status(500).json({ error: err.message });
  }
});
```

---

## (6) server/index.js — unlock 라우터 전환

**기존 unlock 라우터를 통째로 주석 처리한 뒤** 다음 코드 추가:

```javascript
// [PROMPT_44-B] Repository Pattern 전환 — 기존 코드는 위에 주석으로 보존
// app.post('/api/admin/final/:id/unlock', auth, masterOnly, (req, res) => {
//   ... (기존 코드 전체 주석)
// });

// [PROMPT_44-B] Repository Pattern 적용
app.post('/api/admin/final/:id/unlock', auth, masterOnly, async (req, res) => {
  try {
    const fe = await finalRepo.findById(req.params.id);
    if (!fe) return res.status(404).json({ error: '최종평가를 찾을 수 없습니다.' });

    // final_evaluations 초기화 + 별점 초기화 (트랜잭션 내)
    await finalRepo.resetForUnlock(req.params.id);

    // eval_cycles → final_self, 잠금 해제
    await evalCycleRepo.updatePhaseAndLocked(fe.eval_id, 'final_self', 0);

    // 감사 로그용 정보
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

**참고**: 감사 로그 부분의 `db.prepare(...)` 직접 호출은 그대로 유지. 이 부분은 PROMPT 45+에서 점진적으로 정리.

---

## 작업 순서

1. `server/repositories/EvalCycleRepository.js` 편집 → `updatePhaseAndLocked` 추가
2. `server/adapters/prisma/PrismaEvalCycleRepository.js` 편집 → `updatePhaseAndLocked` 구현
3. `server/repositories/FinalEvaluationRepository.js` 편집 → `findById`, `resetForUnlock` 추가
4. `server/adapters/prisma/PrismaFinalEvaluationRepository.js` 편집 → 두 메서드 구현
5. `server/index.js` 편집 → 두 라우터 주석 처리 + 새 라우터 작성
6. 서버 재시작 (`node server/index.js` 또는 `docker-compose restart`)

---

## 검증 절차

### 시나리오 A — unlock 동작 검증
1. ceo 로그인 (`ceo@synapsoft.com / admin1234`)
2. 관리자 페이지 → 전직원 평가 현황 → 오영업 2026년 상반기 (final_done) 찾기
3. 콘솔에서 직접 호출 (UI에 unlock 버튼이 있다면 그것 사용):
   ```javascript
   await API.post('/admin/final/3/unlock', {});  // 오영업의 final_evaluations.id=3
   ```
4. ✅ 응답 `{success: true}`
5. ✅ 콘솔 재조회로 확인:
   ```javascript
   const fe = await API.get('/final/2');
   console.log(fe);
   ```
   - `locked: 0`
   - `self_done: 0`, `mgr_done: 0`, `mgr_approver_id: null`
   - `final_score: null`, `final_grade: null`
   - `scores[].mgr_score: null` (모두)
   - `scores[].self_score`는 보존되어 있어야 함 (`4, 4, 3`)
6. ✅ eval_cycles phase 확인:
   ```javascript
   const evs = await API.get('/evals');
   const oh = evs.find(e => e.id === 2);
   console.log(oh.phase, oh.locked);
   ```
   - `phase: 'final_self'`, `locked: 0`

⚠️ **검증 후 데이터 원복 필요**: 위 unlock 후 다시 force-phase로 final_done 복원
```javascript
await API.post('/admin/eval/2/force-phase', { phase: 'final_done' });
```
(단, 이 force-phase는 self_done/mgr_done까지 복원하지는 못함. 검증 끝나면 그냥 두거나 별도 보강)

### 시나리오 B — force-phase 동작 검증
1. ceo 로그인
2. 콘솔:
   ```javascript
   await API.post('/admin/eval/4/force-phase', { phase: 'approved' });  // 현재 approved → 그대로
   ```
3. ✅ 응답 `{success: true}`, 데이터 변화 없음
4. 다른 값으로 시도:
   ```javascript
   await API.post('/admin/eval/4/force-phase', { phase: 'invalid_phase' });
   ```
5. ✅ 400 에러 `{error: '유효하지 않은 phase입니다.'}`

### 시나리오 C — 회귀 방지
- 기존 평가 워크플로우(목표 작성 → 승인 → 자기평가 → 상사평가 → final_done) 정상 동작
- 감사 로그(`/admin/audit`)에 force-phase, unlock 기록 정상 남는지 확인

---

## 주의 사항

- **테스트 데이터 백업 권장**: unlock 검증은 데이터를 변경하므로 사전에 `data/hrmanage.db` 파일 백업 권장
  ```powershell
  Copy-Item data\hrmanage.db data\hrmanage.db.bak-44b
  ```
- **트랜잭션 격리**: `resetForUnlock`은 Prisma `$transaction`으로 묶여있어, 일부만 실행되어 모순 발생할 위험 없음
- **`new Date().toISOString().slice(0, 19).replace('T', ' ')`**: SQLite의 `datetime('now')`와 동등한 표현. PROMPT 40-A 패턴 그대로 활용

---

## 커밋 메시지

```
refactor: force-phase, unlock 라우터 Repository 전환 (PROMPT 44-B)
```

---

## 작업 완료 후

- ClaudeHRM.md "최근 개발 이력" 상단에 1줄 추가:
  ```
  | 2026-05-20 | force-phase, unlock 라우터 Repository 전환 (EvalCycle.updatePhaseAndLocked, FinalEvaluation.resetForUnlock 추가) (PROMPT 44-B) | Claude Code |
  ```
- ClaudeHRM.md "핵심 설계 원칙" 18번 항목(Repository Pattern 적용) 메모에 force-phase/unlock 전환 사실 추가
