# PROMPT 44: FinalEvaluation Repository 어댑터

> 작성일: 2026-05-20
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 43 완료 (push)
> 패턴: 43 (Feedback) 패턴 확장 — Aggregate Root + 비즈니스 로직 다수
> 위험도: **상** (암호화 3개 필드, 2차 평가 분기, 점수 계산, 잠금 처리)
> 예상 소요: 2시간
> 저장 위치: prompts/CLAUDE_CODE_PROMPT_44.md
> 작업 범위: 핵심 3개 라우터 (force-phase, unlock은 별도 PROMPT 44-B로)

---

## 배경

Repository Pattern 적용 도메인 7개(User, GoalCategory, GradeCriteria, Organization, EvalCycle, Goal, Feedback) 누적되었습니다. 이번에는 **가장 복잡한 도메인** FinalEvaluation으로 진입합니다.

### 복잡도 요인

| 항목 | 내용 |
|------|------|
| 테이블 수 | 2개 (final_evaluations + final_eval_scores) |
| 암호화 필드 | 3개 (self_note, mgr_note, second_mgr_note) |
| 권한 분기 | 4가지 (self / 1차mgr / 2차mgr / admin) |
| 점수 계산 | 가중치 기반 환산 + 등급 산정 (S/A/B/C/D) |
| 2차 평가 분기 | second_final 설정 + 조직도 기반 |
| 잠금 처리 | locked + locked_at |

### 41, 43과의 차이

| 항목 | 41 | 43 | 44 |
|------|-----|-----|------|
| 테이블 | 1개 | 2개 | 2개 |
| 암호화 | 2개 | 3개 (참조 포함) | 3개 |
| 비즈니스 로직 | 단순 CRUD | 단순 CRUD | **점수 계산 + 등급 산정** |

---

## 작업 범위

### 본 PROMPT 44 — 핵심 3개 라우터
- `GET /api/final/:evalId` (879줄)
- `POST /api/final/:evalId/self` (905줄)
- `POST /api/final/:evalId/mgr` (933줄)

### PROMPT 44-B (별도) — admin/master 전용 라우터
- `POST /api/admin/eval/:evalId/force-phase` (1283줄)
- `POST /api/admin/final/:id/unlock` (2104줄)

### 신규 생성 파일 (2개)
- `server/repositories/FinalEvaluationRepository.js`
- `server/adapters/prisma/PrismaFinalEvaluationRepository.js`

### 수정 파일 (3개)
- `prisma/schema.prisma` — FinalEvaluation, FinalEvalScore relation 추가
- `server/config/repository-factory.js` — getFinalEvaluationRepository 추가
- `server/index.js` — 라우터 3개 전환

---

## 설계 결정 사항

### 1. Aggregate Root 패턴 (43과 동일)
`FinalEvaluationRepository`가 `final_evaluations` + `final_eval_scores` 모두 처리.

### 2. 비즈니스 로직 위치
- **Repository**: 데이터 CRUD, 암호화, 평탄화
- **라우터**: 권한 체크, 점수 계산 (가중치 × 환산), 등급 산정, phase 결정, 감사 로그

### 3. 점수 필드 분리
final_eval_scores는 같은 행에 self_score, mgr_score, second_mgr_score 3개 컬럼이 함께 있음. Repository는 `upsertScores()` 메서드 하나로 처리하되 어떤 필드를 갱신할지 파라미터로 받음.

### 4. 권한 마스킹은 라우터에
Repository는 항상 평문 반환. 라우터가 chain 확인 후 마스킹.

---

## 작업 지시

### 1단계 — schema.prisma에 FinalEvaluation, FinalEvalScore relation 추가

`prisma/schema.prisma`의 FinalEvaluation 모델에 관계 추가.

**기존**:
```prisma
model FinalEvaluation {
  id              Int     @id @default(autoincrement())
  evalId          Int     @unique @map("eval_id")
  selfNote        String? @map("self_note")
  selfDone        Int?    @default(0) @map("self_done")
  selfDoneAt      String? @map("self_done_at")
  mgrNote         String? @map("mgr_note")
  mgrDone         Int?    @default(0) @map("mgr_done")
  mgrDoneAt       String? @map("mgr_done_at")
  mgrApproverId   Int?    @map("mgr_approver_id")
  finalScore      Float?  @map("final_score")
  finalGrade      String? @map("final_grade")
  selectedGrade   String? @map("selected_grade")
  secondMgrDone   Int?    @default(0) @map("second_mgr_done")
  secondMgrDoneAt String? @map("second_mgr_done_at")
  secondMgrNote   String? @map("second_mgr_note")
  secondMgrId     Int?    @map("second_mgr_id")
  secondSelectedGrade String? @map("second_selected_grade")
  locked          Int?    @default(0)
  lockedAt        String? @map("locked_at")
  created_at      String?
  updated_at      String?

  @@map("final_evaluations")
}
```

**변경 후 (relation 추가)**:
```prisma
model FinalEvaluation {
  id              Int     @id @default(autoincrement())
  evalId          Int     @unique @map("eval_id")
  selfNote        String? @map("self_note")
  selfDone        Int?    @default(0) @map("self_done")
  selfDoneAt      String? @map("self_done_at")
  mgrNote         String? @map("mgr_note")
  mgrDone         Int?    @default(0) @map("mgr_done")
  mgrDoneAt       String? @map("mgr_done_at")
  mgrApproverId   Int?    @map("mgr_approver_id")
  finalScore      Float?  @map("final_score")
  finalGrade      String? @map("final_grade")
  selectedGrade   String? @map("selected_grade")
  secondMgrDone   Int?    @default(0) @map("second_mgr_done")
  secondMgrDoneAt String? @map("second_mgr_done_at")
  secondMgrNote   String? @map("second_mgr_note")
  secondMgrId     Int?    @map("second_mgr_id")
  secondSelectedGrade String? @map("second_selected_grade")
  locked          Int?    @default(0)
  lockedAt        String? @map("locked_at")
  created_at      String?
  updated_at      String?

  // === PROMPT 44 추가 ===
  evalCycle       EvalCycle         @relation("EvalCycleFinalEvaluation", fields: [evalId], references: [id])
  scores          FinalEvalScore[]  @relation("FinalEvaluationScores")

  @@map("final_evaluations")
}
```

### 1-1단계 — FinalEvalScore 모델에 relation 추가

**기존**:
```prisma
model FinalEvalScore {
  id              Int  @id @default(autoincrement())
  finalId         Int  @map("final_id")
  goalId          Int  @map("goal_id")
  selfScore       Int? @map("self_score")
  mgrScore        Int? @map("mgr_score")
  secondMgrScore  Int? @map("second_mgr_score")
  created_at      String?

  @@map("final_eval_scores")
}
```

**변경 후**:
```prisma
model FinalEvalScore {
  id              Int  @id @default(autoincrement())
  finalId         Int  @map("final_id")
  goalId          Int  @map("goal_id")
  selfScore       Int? @map("self_score")
  mgrScore        Int? @map("mgr_score")
  secondMgrScore  Int? @map("second_mgr_score")
  created_at      String?

  // === PROMPT 44 추가 ===
  finalEvaluation FinalEvaluation @relation("FinalEvaluationScores", fields: [finalId], references: [id])

  @@map("final_eval_scores")
}
```

### 1-2단계 — EvalCycle 모델에 역방향 관계 추가

기존 EvalCycle 모델의 relation 영역에 추가:

```prisma
model EvalCycle {
  // ... 기존 필드들
  user              User           @relation("UserEvalCycles", fields: [userId], references: [id])
  goals             Goal[]         @relation("EvalCycleGoals")
  feedbacks         Feedback[]     @relation("EvalCycleFeedbacks")
  // === PROMPT 44 추가 ===
  finalEvaluation   FinalEvaluation? @relation("EvalCycleFinalEvaluation")

  @@map("eval_cycles")
}
```

### 1-3단계 — Prisma Client 재생성

```powershell
npx prisma generate
```

오류 없이 완료되면 다음으로.

---

### 2단계 — FinalEvaluationRepository 인터페이스 생성

`server/repositories/FinalEvaluationRepository.js`:

```javascript
/**
 * FinalEvaluationRepository — 최종 평가 데이터 접근 인터페이스 (Aggregate Root)
 * final_evaluations + final_eval_scores 두 테이블을 함께 처리.
 * 암호화 필드: self_note, mgr_note, second_mgr_note
 */
class FinalEvaluationRepository {
  /**
   * 평가 사이클별 최종평가 조회 (scores 포함, 암호화 필드 자동 복호화)
   * @param {number} evalId
   * @returns {Promise<Object|null>} 최종평가 객체 또는 null
   *   { id, eval_id, self_note, mgr_note, second_mgr_note (모두 평문),
   *     self_done, mgr_done, second_mgr_done, final_score, final_grade,
   *     selected_grade, mgr_approver_id, second_mgr_id, locked, scores: [...] }
   */
  async findByEvalId(evalId) {
    throw new Error('FinalEvaluationRepository.findByEvalId is not implemented');
  }

  /**
   * 최종평가 upsert — 없으면 생성, 있으면 갱신
   * @param {number} evalId
   * @param {Object} data 갱신할 필드들 (note는 평문, Repository가 자동 암호화)
   *   가능 필드: self_note, self_done, self_done_at,
   *              mgr_note, mgr_done, mgr_done_at, mgr_approver_id,
   *              second_mgr_note, second_mgr_done, second_mgr_done_at, second_mgr_id,
   *              final_score, final_grade, selected_grade, second_selected_grade,
   *              locked, locked_at
   * @returns {Promise<number>} final_evaluation.id
   */
  async upsert(evalId, data) {
    throw new Error('FinalEvaluationRepository.upsert is not implemented');
  }

  /**
   * 점수 일괄 upsert — 어떤 필드를 갱신할지 scoreField로 지정
   * @param {number} finalId
   * @param {Array} scores [{ goal_id, score }] 형식
   * @param {string} scoreField 'self_score' | 'mgr_score' | 'second_mgr_score'
   */
  async upsertScores(finalId, scores, scoreField) {
    throw new Error('FinalEvaluationRepository.upsertScores is not implemented');
  }
}

module.exports = FinalEvaluationRepository;
```

---

### 3단계 — PrismaFinalEvaluationRepository 구현체 생성

`server/adapters/prisma/PrismaFinalEvaluationRepository.js`:

```javascript
const FinalEvaluationRepository = require('../../repositories/FinalEvaluationRepository');
const crypto = require('crypto');

class PrismaFinalEvaluationRepository extends FinalEvaluationRepository {
  constructor(prismaClient, encSecret) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaFinalEvaluationRepository requires a prismaClient');
    }
    if (!encSecret) {
      throw new Error('PrismaFinalEvaluationRepository requires encSecret');
    }
    this.prisma = prismaClient;
    this.encSecret = encSecret;
  }

  _encrypt(text) {
    if (!text) return '';
    const iv  = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encSecret, 'salt', 32);
    const c   = crypto.createCipheriv('aes-256-cbc', key, iv);
    const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return iv.toString('hex') + ':' + enc.toString('hex');
  }

  _decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
      const [ivHex, encHex] = text.split(':');
      const key = crypto.scryptSync(this.encSecret, 'salt', 32);
      const d   = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
      return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
    } catch { return '[복호화 오류]'; }
  }

  /**
   * Prisma 응답을 기존 SQL 결과 호환 형태로 평탄화 + 복호화
   */
  _flatten(fe) {
    if (!fe) return null;
    const {
      scores, evalId, selfNote, selfDone, selfDoneAt,
      mgrNote, mgrDone, mgrDoneAt, mgrApproverId,
      finalScore, finalGrade, selectedGrade,
      secondMgrDone, secondMgrDoneAt, secondMgrNote, secondMgrId, secondSelectedGrade,
      lockedAt, ...rest
    } = fe;
    return {
      ...rest,
      eval_id: evalId,
      self_note: selfNote ? this._decrypt(selfNote) : '',
      self_done: selfDone,
      self_done_at: selfDoneAt,
      mgr_note: mgrNote ? this._decrypt(mgrNote) : '',
      mgr_done: mgrDone,
      mgr_done_at: mgrDoneAt,
      mgr_approver_id: mgrApproverId,
      final_score: finalScore,
      final_grade: finalGrade,
      selected_grade: selectedGrade,
      second_mgr_done: secondMgrDone,
      second_mgr_done_at: secondMgrDoneAt,
      second_mgr_note: secondMgrNote ? this._decrypt(secondMgrNote) : '',
      second_mgr_id: secondMgrId,
      second_selected_grade: secondSelectedGrade,
      locked_at: lockedAt,
      scores: (scores || []).map(s => this._flattenScore(s))
    };
  }

  _flattenScore(s) {
    if (!s) return null;
    const { finalId, goalId, selfScore, mgrScore, secondMgrScore, ...rest } = s;
    return {
      ...rest,
      final_id: finalId,
      goal_id: goalId,
      self_score: selfScore,
      mgr_score: mgrScore,
      second_mgr_score: secondMgrScore
    };
  }

  async findByEvalId(evalId) {
    const fe = await this.prisma.finalEvaluation.findUnique({
      where: { evalId: Number(evalId) },
      include: {
        scores: true
      }
    });
    return this._flatten(fe);
  }

  async upsert(evalId, data) {
    // 암호화 처리할 필드 자동 변환
    const updateData = {};
    if (data.self_note !== undefined) updateData.selfNote = this._encrypt(data.self_note || '');
    if (data.self_done !== undefined) updateData.selfDone = Number(data.self_done);
    if (data.self_done_at !== undefined) updateData.selfDoneAt = data.self_done_at;
    if (data.mgr_note !== undefined) updateData.mgrNote = this._encrypt(data.mgr_note || '');
    if (data.mgr_done !== undefined) updateData.mgrDone = Number(data.mgr_done);
    if (data.mgr_done_at !== undefined) updateData.mgrDoneAt = data.mgr_done_at;
    if (data.mgr_approver_id !== undefined) updateData.mgrApproverId = data.mgr_approver_id ? Number(data.mgr_approver_id) : null;
    if (data.second_mgr_note !== undefined) updateData.secondMgrNote = this._encrypt(data.second_mgr_note || '');
    if (data.second_mgr_done !== undefined) updateData.secondMgrDone = Number(data.second_mgr_done);
    if (data.second_mgr_done_at !== undefined) updateData.secondMgrDoneAt = data.second_mgr_done_at;
    if (data.second_mgr_id !== undefined) updateData.secondMgrId = data.second_mgr_id ? Number(data.second_mgr_id) : null;
    if (data.final_score !== undefined) updateData.finalScore = data.final_score;
    if (data.final_grade !== undefined) updateData.finalGrade = data.final_grade;
    if (data.selected_grade !== undefined) updateData.selectedGrade = data.selected_grade;
    if (data.second_selected_grade !== undefined) updateData.secondSelectedGrade = data.second_selected_grade;
    if (data.locked !== undefined) updateData.locked = Number(data.locked);
    if (data.locked_at !== undefined) updateData.lockedAt = data.locked_at;
    
    const result = await this.prisma.finalEvaluation.upsert({
      where: { evalId: Number(evalId) },
      create: {
        evalId: Number(evalId),
        ...updateData
      },
      update: updateData
    });
    return result.id;
  }

  async upsertScores(finalId, scores, scoreField) {
    // scoreField는 'selfScore' | 'mgrScore' | 'secondMgrScore' (camelCase)
    if (!['selfScore', 'mgrScore', 'secondMgrScore'].includes(scoreField)) {
      throw new Error(`Invalid scoreField: ${scoreField}`);
    }
    
    await this.prisma.$transaction(async (tx) => {
      for (const s of (scores || [])) {
        if (s.score === undefined || s.score === null) continue;
        
        // 해당 final_id + goal_id 조합 존재 여부 확인
        const existing = await tx.finalEvalScore.findFirst({
          where: { finalId: Number(finalId), goalId: Number(s.goal_id) }
        });
        
        if (existing) {
          await tx.finalEvalScore.update({
            where: { id: existing.id },
            data: { [scoreField]: Number(s.score) }
          });
        } else {
          await tx.finalEvalScore.create({
            data: {
              finalId: Number(finalId),
              goalId: Number(s.goal_id),
              [scoreField]: Number(s.score)
            }
          });
        }
      }
    });
  }
}

module.exports = PrismaFinalEvaluationRepository;
```

---

### 4단계 — 팩토리 갱신

`server/config/repository-factory.js`에 추가:

```javascript
const FinalEvaluationRepository = require('../repositories/FinalEvaluationRepository');
const PrismaFinalEvaluationRepository = require('../adapters/prisma/PrismaFinalEvaluationRepository');

function getFinalEvaluationRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  return new PrismaFinalEvaluationRepository(getSharedPrismaClient(), encSecret);
}

// exports에 추가
module.exports = {
  // ... 기존
  getFinalEvaluationRepository,
  FinalEvaluationRepository,
  PrismaFinalEvaluationRepository
};
```

---

### 5단계 — server/index.js 라우터 3개 전환

#### 5-1. 상단 import 추가

```javascript
const {
  // ... 기존
  getFinalEvaluationRepository,  // ← 추가
} = require('./config/repository-factory');

// ...
const finalEvalRepo = getFinalEvaluationRepository();  // ← 추가
```

#### 5-2. GET /api/final/:evalId (879줄 근처)

**변경 후**:
```javascript
app.get('/api/final/:evalId', auth, async (req, res) => {
  try {
    const fe = await finalEvalRepo.findByEvalId(req.params.evalId);
    if (!fe) return res.json(null);
    
    const isAdmin = ['master','admin'].includes(req.user.role);
    const ev2 = await evalCycleRepo.findById(req.params.evalId);
    const isOwner = ev2 && String(ev2.user_id) === String(req.user.sub);
    
    // 승인자 체인 전체 열람 허용 (userRepo.isInApproverChain 사용)
    const isChainApprover = ev2 ? await userRepo.isInApproverChain(req.user.sub, ev2.user_id) : false;
    const canRead = isAdmin || isOwner || isChainApprover;
    
    // 권한별 마스킹
    if (!canRead) {
      fe.self_note = null;
      fe.mgr_note = null;
      fe.second_mgr_note = null;
    }
    
    res.json(fe);
  } catch(err) {
    console.error('[GET /api/final/:evalId]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 5-3. POST /api/final/:evalId/self (905줄 근처)

**변경 후**:
```javascript
app.post('/api/final/:evalId/self', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (!['approved','final_self'].includes(ev.phase))
      return res.status(400).json({ error: '자기평가 불가 상태' });

    // 이미 제출 완료된 경우 재제출 차단
    const existFe = await finalEvalRepo.findByEvalId(ev.id);
    if (existFe?.self_done === 1)
      return res.status(400).json({ error: '이미 제출된 자기평가는 수정할 수 없습니다.' });

    const { self_note, scores } = req.body;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // 1. final_evaluation upsert (self_done=1)
    const feId = await finalEvalRepo.upsert(ev.id, {
      self_note: self_note || '',
      self_done: 1,
      self_done_at: now
    });
    
    // 2. self_score 일괄 저장
    if (scores && scores.length) {
      await finalEvalRepo.upsertScores(feId, scores, 'selfScore');
    }
    
    // 3. phase 변경 (eval_cycles 직접 조작 — EvalCycle Repository로 이관 가능하지만 일단 raw 유지)
    db.prepare("UPDATE eval_cycles SET phase='final_mgr_pending',updated_at=datetime('now') WHERE id=?").run(ev.id);
    
    res.json({ success: true });
  } catch(err) {
    console.error('[final self]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 5-4. POST /api/final/:evalId/mgr (933줄 근처) — 가장 복잡

**변경 후**:
```javascript
app.post('/api/final/:evalId/mgr', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev || !['final_mgr_pending','final_mgr2_pending'].includes(ev.phase))
      return res.status(400).json({ error: '상사 평가 불가 상태' });

    const targetUser = db.prepare('SELECT manager_id FROM users WHERE id=?').get(ev.user_id);
    const isAdmin    = ['master','admin'].includes(req.user.role);
    const isDirect   = String(targetUser?.manager_id) === String(req.user.sub);

    // 2차 평가 여부 판단 (조직도 기반)
    const secondEnabled = getSetting('second_final', '0') === '1';
    let isSecond = false;
    if (secondEnabled) {
      const directMgr = targetUser?.manager_id
        ? db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(targetUser.manager_id))
        : null;
      isSecond = String(directMgr?.manager_id) === String(req.user.sub);
    }

    // 권한 체크
    if (!isDirect && !isSecond && !isAdmin) {
      return res.status(403).json({ error: '평가 권한 없음' });
    }

    console.log('[최종평가제출]', {
      evalId: req.params.evalId, userId: req.user.sub,
      isDirect, isSecond, isAdmin, phase: ev.phase
    });

    // FinalEvaluation 조회 또는 생성
    let fe = await finalEvalRepo.findByEvalId(ev.id);
    if (!fe) {
      const newId = await finalEvalRepo.upsert(ev.id, {});
      fe = { id: newId, mgr_done: 0 };
    }

    const { mgr_note, scores, selected_grade } = req.body;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (isSecond) {
      // ── 2차 평가자 제출 ──────────────────────────────────
      if (!fe.mgr_done) return res.status(400).json({ error: '1차 평가자가 먼저 평가를 완료해야 합니다.' });

      // 2차 별점 저장
      await finalEvalRepo.upsertScores(fe.id, scores, 'secondMgrScore');
      
      // FinalEvaluation 업데이트 (2차 완료)
      await finalEvalRepo.upsert(ev.id, {
        second_mgr_note: mgr_note || '',
        second_mgr_done: 1,
        second_mgr_done_at: now,
        second_mgr_id: req.user.sub,
        selected_grade: selected_grade || fe.selected_grade,
        second_selected_grade: selected_grade || '',
        locked: 1,
        locked_at: now
      });
      
      // eval_cycles phase + locked
      db.prepare("UPDATE eval_cycles SET phase='final_done',locked=1,updated_at=datetime('now') WHERE id=?").run(ev.id);

      const t2 = db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id);
      auditLog(req.user.sub, 'FINAL_EVAL_2ND', ev.user_id, t2?.name,
        `2차 최종평가 완료 (${ev.period_label||''})`, req.ip);
      res.json({ success: true, is_second: true });

    } else {
      // ── 1차 평가자 제출 ──────────────────────────────────
      
      // 1차 별점 저장
      await finalEvalRepo.upsertScores(fe.id, scores, 'mgrScore');

      // 최종 점수 계산 (가중치 기반)
      // goals 직접 조회는 일단 유지 (Goal Repository로 이관 가능하지만 별도 작업)
      const goals = db.prepare(
        `SELECT g.weight, fes.mgr_score
         FROM goals g 
         JOIN final_eval_scores fes ON fes.goal_id=g.id 
         WHERE g.eval_id=? AND fes.mgr_score IS NOT NULL`
      ).all(ev.id);
      const totalW     = goals.reduce((a, g) => a + g.weight, 0) || 1;
      const score      = goals.reduce((a, g) => a + (g.mgr_score / 5 * 100) * (g.weight / totalW), 0);
      const finalScore = Math.round(score * 10) / 10;
      const grade      = finalScore >= 90 ? 'S' : finalScore >= 80 ? 'A' : finalScore >= 70 ? 'B' : finalScore >= 60 ? 'C' : 'D';
      const finalGradeCode = selected_grade || grade;
      
      // FinalEvaluation 업데이트 (1차 완료 + 점수)
      await finalEvalRepo.upsert(ev.id, {
        mgr_note: mgr_note || '',
        mgr_done: 1,
        mgr_done_at: now,
        mgr_approver_id: req.user.sub,
        final_score: finalScore,
        final_grade: finalGradeCode,
        selected_grade: selected_grade || grade
      });

      // 2차 평가 분기
      if (secondEnabled) {
        const directMgrUser = targetUser?.manager_id
          ? db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(targetUser.manager_id))
          : null;
        if (directMgrUser?.manager_id) {
          // 2차 평가자 있음 → final_mgr2_pending
          db.prepare("UPDATE eval_cycles SET phase='final_mgr2_pending',updated_at=datetime('now') WHERE id=?").run(ev.id);
        } else {
          // 2차 평가자 없음 → 바로 final_done + 잠금
          db.prepare("UPDATE eval_cycles SET phase='final_done',locked=1,updated_at=datetime('now') WHERE id=?").run(ev.id);
          await finalEvalRepo.upsert(ev.id, { locked: 1, locked_at: now });
        }
      } else {
        // 2차 평가 꺼짐 → 바로 final_done + 잠금
        db.prepare("UPDATE eval_cycles SET phase='final_done',locked=1,updated_at=datetime('now') WHERE id=?").run(ev.id);
        await finalEvalRepo.upsert(ev.id, { locked: 1, locked_at: now });
      }

      const t1 = db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id);
      auditLog(req.user.sub, 'FINAL_EVAL_LOCKED', ev.user_id, t1?.name,
        `1차 최종평가 완료 — 점수: ${finalScore}점 / 등급: ${grade} (${ev.period_label||''})`, req.ip);
      res.json({ success: true, final_score: finalScore, grade });
    }
  } catch(err) {
    console.error('[final mgr]', err);
    res.status(500).json({ error: err.message });
  }
});
```

---

## 검증 절차

### 1. Prisma 재생성
```powershell
npx prisma generate
```

### 2. 서버 실행
```powershell
taskkill /IM node.exe /F
node server\index.js
```

또는 Docker:
```powershell
docker-compose down
docker-compose build
docker-compose up
```

### 3. 브라우저 검증 — 단계별

#### 3-1. 데이터 호환성 (최우선)

기존에 완료된 최종평가가 있다면 그것부터 확인:
- 관리자(`ceo@synapsoft.com`)로 로그인
- 전직원 평가 현황 → 최종평가 완료된 직원 선택
- self_note, mgr_note가 **평문 정상 표시**되어야 함
- `[복호화 오류]` 보이면 즉시 멈춤

#### 3-2. 자기 최종평가 (신규)

`dev3@synapsoft.com / user1234` 로그인:
- 내 평가 → 승인 완료된 평가
- 자기 최종평가 화면 진입
- 각 목표별 별점 부여 + 자기 의견 입력
- 제출 → `phase=final_mgr_pending`로 변경

#### 3-3. 1차 상사 최종평가

`dev2@synapsoft.com / user1234` 로그인 (dev3의 직속상사):
- 내가 평가할 직원 목록 → dev3 선택
- 별점 부여 + 의견 입력 + 등급 선택
- 제출 → 점수/등급 계산 정상, `phase=final_done` 또는 `final_mgr2_pending`

#### 3-4. 2차 상사 최종평가 (2차 평가 설정 켜진 경우)

`dev1@synapsoft.com / user1234` 로그인 (dev2의 상사):
- 2차 평가 화면
- 정상 작동 확인

### 4. 암호화 검증 (Prisma Studio)

```powershell
npx prisma studio
```

- `final_evaluations` 테이블의 `self_note`, `mgr_note`, `second_mgr_note` → 모두 암호문 (`hex:hex`)
- `final_eval_scores` 테이블의 점수들 정상

---

## 완료 후 처리

### 1. ClaudeHRM.md 갱신

"최근 개발 이력":
```
| 2026-05-20 | PROMPT 44: FinalEvaluation Repository 어댑터 (Aggregate Root, 암호화 3개, 점수 계산, 2차 평가 분기) | Claude Code |
```

### 2. 커밋 + 푸시

```powershell
git add prisma/schema.prisma
git add server/repositories/FinalEvaluationRepository.js
git add server/adapters/prisma/PrismaFinalEvaluationRepository.js
git add server/config/repository-factory.js
git add server/index.js
git add ClaudeHRM.md
git add prompts/CLAUDE_CODE_PROMPT_44.md
git commit -m "feat(repository): FinalEvaluation Repository Pattern 적용 (PROMPT 44)"
git push
```

---

## 작업 시 주의사항

- **암호화 알고리즘 일치 필수** — 40-A, 41, 43 패턴 그대로
- **점수 계산 로직 보존** — 가중치 환산, 등급 산정(S/A/B/C/D) 그대로 유지
- **2차 평가 분기 로직 보존** — second_final 설정 + 조직도 기반 판단 그대로
- **권한 4가지 분기 보존** — self / isDirect / isSecond / isAdmin
- **트랜잭션 — upsertScores는 내부 $transaction**
- **goals 테이블 직접 조회 임시 유지** — 점수 계산용 goals 조회는 raw SQL 유지 (별도 PROMPT에서 이관 가능)
- **eval_cycles phase 변경 직접 조작 임시 유지** — EvalCycle Repository로 이관 가능하지만 일단 raw 유지

---

## 다음 작업 예고

### PROMPT 44-B (선택)
- POST /api/admin/eval/:evalId/force-phase (1283줄)
- POST /api/admin/final/:id/unlock (2104줄)

### PROMPT 45 — ProgressReport Repository
- 중간 보고 라우터들
- 암호화 1개 필드 (content)
- 첨부 파일 처리 (file_data) — INFRA-2에서 MinIO와 함께 처리 고려

### INFRA-2 — PostgreSQL + MinIO 통합
- Repository Pattern 완성 후 진행
