# PROMPT 40-A: EvalCycle Repository 어댑터 (핵심 4개 라우터)

> 작성일: 2026-05-18
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 36-1 ~ 38, 38-followup 완료 (8ab1732)
> 패턴: 36-6, 36-8, 38 패턴 확장 + 암호화 처리 신규 도입
> 위험도: 중상 (암호화 필드, 권한 체크 CTE 도입)
> 예상 소요: 1.5시간
> 분할: 40-A (이 PROMPT) 핵심 4개, 40-B (별도) my-history + my-mgr-pending

---

## 배경

Repository Pattern 적용 도메인이 4개(User, GoalCategory, GradeCriteria, Organization) 누적되었습니다. 이번에는 **본격적인 비즈니스 객체**인 EvalCycle로 진입합니다.

**기존 도메인과의 차이점 (중요)**:

| 항목 | 기존 (User/GoalCategory/GradeCriteria/Organization) | EvalCycle (이번) |
|------|----------------|--------------|
| 데이터 성격 | 마스터 데이터 (참조용) | 트랜잭션 데이터 (실제 업무) |
| 암호화 필드 | 없음 | **self_reason, reject_reason 2개** |
| 권한 체크 | 단순 (auth, adminOnly) | **승인자 체인 탐색 (CTE)** |
| JOIN | 1-way (Organization → leader) | 2-way (EvalCycle → User) |
| 라우터 수 | 4~5개 | 6개 (이번 작업은 4개만) |

---

## 작업 범위 (40-A)

### 신규 라우터 4개 처리
- GET /api/evals (397줄)
- POST /api/evals (423줄)
- PATCH /api/evals/:id/reopen (495줄)
- POST /api/evals/:id/submit (511줄)

### 40-B로 이관 (이번 작업 제외)
- GET /api/evals/my-history (527줄) — Goal/Approval 어댑터 진행 후 처리
- GET /api/evals/my-mgr-pending (1921줄) — 동일

### 신규 생성 파일 (2개)
- `server/repositories/EvalCycleRepository.js` (인터페이스)
- `server/adapters/prisma/PrismaEvalCycleRepository.js` (Prisma 구현체)

### 수정 파일 (4개)
- `server/repositories/UserRepository.js` — `isInApproverChain` 메서드 시그니처 추가
- `server/adapters/prisma/PrismaUserRepository.js` — `isInApproverChain` 구현 추가
- `server/config/repository-factory.js` — getEvalCycleRepository 추가
- `server/index.js` — 라우터 4개 전환
- `prisma/schema.prisma` — EvalCycle relation 추가

---

## 설계 결정 사항 (확정)

1. **암호화 자동 처리**: Repository가 저장 시 자동 암호화, 조회 시 자동 복호화. 라우터는 항상 평문만 다룬다.
2. **권한 체크는 UserRepository에**: `isInApproverChain(approverId, targetUserId)` 메서드 신설. CTE 로직을 Prisma raw 또는 재귀 호출로 처리.
3. **JOIN 처리**: schema.prisma에 EvalCycle ↔ User relation 추가, Prisma `include` 사용 (38-followup 패턴).
4. **권한별 마스킹은 라우터에**: Repository는 항상 평문 반환. 라우터가 권한 확인 후 필요 시 null 처리.

---

## 작업 지시

### 1단계 — schema.prisma에 EvalCycle relation 추가

`prisma/schema.prisma`의 EvalCycle 모델(43~60줄)에 User 관계 추가.

**기존**:
```prisma
model EvalCycle {
  id           Int     @id @default(autoincrement())
  userId       Int     @map("user_id")
  periodType   String? @map("period_type")
  // ... (생략)
  @@map("eval_cycles")
}
```

**변경 후 — User 관계 추가**:
```prisma
model EvalCycle {
  id           Int     @id @default(autoincrement())
  userId       Int     @map("user_id")
  periodType   String? @map("period_type")
  periodLabel  String? @map("period_label")
  evalYear     String? @map("eval_year")
  phase        String? @default("draft")
  selfReason   String? @map("self_reason")
  submitted_at String?
  approved_at  String?
  locked       Int?    @default(0)
  created_at   String?
  updated_at   String?
  rejectReason String? @map("reject_reason")
  phase2       String?

  // === explicit relations (PROMPT 40-A 추가) ===
  user         User    @relation("UserEvalCycles", fields: [userId], references: [id])

  @@map("eval_cycles")
}
```

그리고 User 모델(10~31줄)에도 역방향 관계 추가:

**기존 User 모델 끝부분**:
```prisma
  // === explicit relations (38-followup 추가) ===
  organization     Organization?  @relation("OrgMembers", fields: [orgId], references: [id])
  ledOrganizations Organization[] @relation("OrgLeader")

  @@map("users")
}
```

**변경 후 — EvalCycle 역방향 추가**:
```prisma
  // === explicit relations (38-followup 추가) ===
  organization     Organization?  @relation("OrgMembers", fields: [orgId], references: [id])
  ledOrganizations Organization[] @relation("OrgLeader")
  // === explicit relations (PROMPT 40-A 추가) ===
  evalCycles       EvalCycle[]    @relation("UserEvalCycles")

  @@map("users")
}
```

**완료 후 명령**:
```powershell
npx prisma generate
```

---

### 2단계 — EvalCycleRepository 인터페이스 생성

`server/repositories/EvalCycleRepository.js`:

```javascript
/**
 * EvalCycleRepository — 평가 사이클 데이터 접근 인터페이스
 * eval_cycles 테이블 추상화.
 * 암호화 필드: self_reason, reject_reason (저장/조회 시 자동 처리)
 * 실제 구현은 server/adapters/prisma/PrismaEvalCycleRepository.js
 */
class EvalCycleRepository {
  /**
   * ID로 평가 사이클 조회 (암호화 필드 자동 복호화, user 정보 포함)
   * @param {number} id - 평가 사이클 ID
   * @returns {Promise<Object|null>} 평가 사이클 객체 (user_name, dept 포함) 또는 null
   */
  async findById(id) {
    throw new Error('EvalCycleRepository.findById is not implemented');
  }

  /**
   * 평가 사이클 목록 조회 (필터링/권한 분기는 호출자가 처리)
   * @param {Object} options { userId, scope: 'all'|'mine'|'team' }
   *   - scope='all': 전체 (관리자용)
   *   - scope='mine': 본인 + 직속 부하
   *   - userId: scope='mine'/'team'일 때 기준 사용자 ID
   * @returns {Promise<Array>} 평가 사이클 객체 배열 (user_name, dept 포함, 암호화 필드 자동 복호화)
   */
  async findList({ userId, scope }) {
    throw new Error('EvalCycleRepository.findList is not implemented');
  }

  /**
   * draft 상태의 평가 사이클 찾기 (중복 생성 방지용)
   * @param {number} userId
   * @returns {Promise<Object|null>} draft 평가 사이클 또는 null
   */
  async findDraftByUserId(userId) {
    throw new Error('EvalCycleRepository.findDraftByUserId is not implemented');
  }

  /**
   * 새 평가 사이클 생성
   * @param {Object} data { user_id, period_type, period_label, eval_year }
   * @returns {Promise<number>} 생성된 평가 사이클 ID
   */
  async create(data) {
    throw new Error('EvalCycleRepository.create is not implemented');
  }

  /**
   * 평가 사이클 phase 및 자기평가 사유 업데이트 (제출 시)
   * @param {number} id - 평가 사이클 ID
   * @param {Object} data { phase, self_reason (평문, Repository에서 암호화), submitted_at }
   */
  async updatePhaseAndReason(id, data) {
    throw new Error('EvalCycleRepository.updatePhaseAndReason is not implemented');
  }

  /**
   * 반려된 평가 사이클을 draft로 되돌림 (reopen)
   * @param {number} id - 평가 사이클 ID
   */
  async reopen(id) {
    throw new Error('EvalCycleRepository.reopen is not implemented');
  }
}

module.exports = EvalCycleRepository;
```

---

### 3단계 — PrismaEvalCycleRepository 구현체 생성

`server/adapters/prisma/PrismaEvalCycleRepository.js`:

```javascript
const EvalCycleRepository = require('../../repositories/EvalCycleRepository');
const crypto = require('crypto');

/**
 * Prisma 기반 EvalCycleRepository 구현체
 * 암호화: self_reason, reject_reason 필드 자동 처리
 * JOIN: User 관계 include로 user_name, dept 포함
 */
class PrismaEvalCycleRepository extends EvalCycleRepository {
  constructor(prismaClient, encSecret) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaEvalCycleRepository requires a prismaClient instance');
    }
    if (!encSecret) {
      throw new Error('PrismaEvalCycleRepository requires encSecret for encryption');
    }
    this.prisma = prismaClient;
    this.encSecret = encSecret;
  }

  /**
   * AES-256-CBC 암호화 (server/index.js의 encrypt 함수와 동일 로직)
   */
  _encrypt(text) {
    if (!text) return '';
    const iv  = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encSecret, 'salt', 32);
    const c   = crypto.createCipheriv('aes-256-cbc', key, iv);
    const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return iv.toString('hex') + ':' + enc.toString('hex');
  }

  /**
   * AES-256-CBC 복호화 (server/index.js의 decrypt 함수와 동일 로직)
   */
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
   * Prisma 응답을 기존 SQL 결과와 호환되는 평탄화 형태로 변환
   * - camelCase → snake_case
   * - user 관계 → user_name, dept 평탄화
   * - 암호화 필드 자동 복호화
   */
  _flatten(ev) {
    if (!ev) return null;
    const { user, userId, periodType, periodLabel, evalYear, selfReason, rejectReason, ...rest } = ev;
    return {
      ...rest,
      user_id: userId,
      period_type: periodType,
      period_label: periodLabel,
      eval_year: evalYear,
      self_reason: selfReason ? this._decrypt(selfReason) : '',
      reject_reason: rejectReason ? this._decrypt(rejectReason) : '',
      user_name: user?.name || null,
      dept: user?.dept || null
    };
  }

  async findById(id) {
    const ev = await this.prisma.evalCycle.findUnique({
      where: { id: Number(id) },
      include: {
        user: { select: { name: true, dept: true } }
      }
    });
    return this._flatten(ev);
  }

  async findList({ userId, scope }) {
    let where = {};
    if (scope === 'mine' && userId) {
      // 본인 + 직속 부하
      where = {
        OR: [
          { userId: Number(userId) },
          { user: { managerId: Number(userId) } }
        ]
      };
    }
    // scope === 'all' 인 경우 where = {} (전체)

    const evs = await this.prisma.evalCycle.findMany({
      where,
      include: {
        user: { select: { name: true, dept: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    return evs.map(e => this._flatten(e));
  }

  async findDraftByUserId(userId) {
    const ev = await this.prisma.evalCycle.findFirst({
      where: {
        userId: Number(userId),
        phase: 'draft'
      },
      orderBy: { created_at: 'desc' }
    });
    return ev ? { id: ev.id } : null;
  }

  async create(data) {
    const created = await this.prisma.evalCycle.create({
      data: {
        userId: Number(data.user_id),
        periodType: data.period_type,
        periodLabel: data.period_label,
        evalYear: data.eval_year
      }
    });
    return created.id;
  }

  async updatePhaseAndReason(id, data) {
    const updateData = {
      phase: data.phase,
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    if (data.self_reason !== undefined) {
      updateData.selfReason = this._encrypt(data.self_reason || '');
    }
    if (data.submitted_at !== undefined) {
      updateData.submitted_at = data.submitted_at;
    }
    await this.prisma.evalCycle.update({
      where: { id: Number(id) },
      data: updateData
    });
  }

  async reopen(id) {
    await this.prisma.evalCycle.update({
      where: { id: Number(id) },
      data: {
        phase: 'draft',
        rejectReason: null,
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      }
    });
  }
}

module.exports = PrismaEvalCycleRepository;
```

**주의 사항**:
- 암호화 시크릿(`encSecret`)을 생성자로 주입받음 (테스트 용이성, .env 분리 준비)
- `created_at`, `updated_at`은 기존 SQLite 패턴(`datetime('now')`) 유지를 위해 JavaScript에서 포맷팅
- snake_case 필드명을 클라이언트 호환성 위해 `_flatten()` 으로 유지

---

### 4단계 — UserRepository에 isInApproverChain 추가

#### 4-1. 인터페이스에 시그니처 추가

`server/repositories/UserRepository.js`의 클래스 내부에 추가:

```javascript
/**
 * approverId가 targetUserId의 승인자 체인에 포함되는지 확인
 * (manager_id를 재귀적으로 탐색)
 * @param {number} approverId - 확인할 사용자 ID
 * @param {number} targetUserId - 대상 사용자 ID
 * @returns {Promise<boolean>} 승인자 체인 포함 여부
 */
async isInApproverChain(approverId, targetUserId) {
  throw new Error('UserRepository.isInApproverChain is not implemented');
}
```

#### 4-2. PrismaUserRepository에 구현 추가

`server/adapters/prisma/PrismaUserRepository.js`의 클래스 내부에 추가:

```javascript
async isInApproverChain(approverId, targetUserId) {
  // manager_id 체인을 최대 10단계까지 재귀 탐색
  const approverIdStr = String(approverId);
  let currentUserId = Number(targetUserId);

  for (let depth = 0; depth < 10; depth++) {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { managerId: true }
    });
    if (!user || !user.managerId) return false;
    if (String(user.managerId) === approverIdStr) return true;
    currentUserId = user.managerId;
  }
  return false;
}
```

**주의 사항**:
- 기존 SQL의 WITH RECURSIVE CTE를 JavaScript 재귀 호출로 변환
- 무한 루프 방지 (최대 10단계 제한)
- String 비교로 통일 (JWT는 string, DB는 integer일 수 있음)

---

### 5단계 — 팩토리 갱신

`server/config/repository-factory.js`에 추가:

```javascript
const EvalCycleRepository = require('../repositories/EvalCycleRepository');
const PrismaEvalCycleRepository = require('../adapters/prisma/PrismaEvalCycleRepository');

function getEvalCycleRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  return new PrismaEvalCycleRepository(getSharedPrismaClient(), encSecret);
}

// exports에 추가
module.exports = {
  // ... 기존 exports
  getEvalCycleRepository,
  EvalCycleRepository,
  PrismaEvalCycleRepository
};
```

---

### 6단계 — server/index.js 라우터 4개 전환

#### 6-1. 상단 import 추가

```javascript
const {
  getUserRepository,
  getGoalCategoryRepository,
  getGradeCriteriaRepository,
  getOrganizationRepository,
  getEvalCycleRepository,  // ← 추가
} = require('./config/repository-factory');

// ... 기존 코드
const evalCycleRepo = getEvalCycleRepository();  // ← 추가
```

#### 6-2. GET /api/evals (397줄)

**변경 후**:
```javascript
app.get('/api/evals', auth, async (req, res) => {
  try {
    const isAdmin = ['master','admin'].includes(req.user.role);
    const scope = isAdmin ? 'all' : 'mine';
    const rows = await evalCycleRepo.findList({ userId: req.user.sub, scope });

    // 권한별 마스킹: 관리자/본인/승인자 체인이 아닌 경우 암호화 필드 null 처리
    for (const r of rows) {
      const isOwner = String(r.user_id) === String(req.user.sub);
      const isApprover = isOwner ? false : await userRepo.isInApproverChain(req.user.sub, r.user_id);
      if (!isAdmin && !isOwner && !isApprover) {
        r.self_reason = null;
        r.reject_reason = null;
      }
    }
    res.json(rows);
  } catch(err) {
    console.error('[GET /api/evals]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 6-3. POST /api/evals (423줄)

**변경 후**:
```javascript
app.post('/api/evals', auth, async (req, res) => {
  try {
    const { period_type, period_label, eval_year } = req.body;
    const safePeriodType  = period_type  || 'q';
    const safePeriodLabel = period_label || (eval_year || '2025년') + ' 1분기';
    const safeYear        = eval_year    || '2025년';

    // draft 중복 방지
    const existing = await evalCycleRepo.findDraftByUserId(req.user.sub);
    if (existing) return res.json({ id: existing.id });

    const newId = await evalCycleRepo.create({
      user_id: req.user.sub,
      period_type: safePeriodType,
      period_label: safePeriodLabel,
      eval_year: safeYear
    });
    res.json({ id: newId });
  } catch(err) {
    console.error('[POST /api/evals]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 6-4. PATCH /api/evals/:id/reopen (495줄)

**변경 후**:
```javascript
app.patch('/api/evals/:id/reopen', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.id);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (ev.phase !== 'rejected')
      return res.json({ success: true });
    
    await evalCycleRepo.reopen(ev.id);
    // goals 테이블 update는 추후 Goal Repository 도입 후 이관 (40-A 범위 밖)
    db.prepare("UPDATE goals SET status='draft' WHERE eval_id=?").run(ev.id);
    
    res.json({ success: true });
  } catch(err) {
    console.error('[reopen]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 6-5. POST /api/evals/:id/submit (511줄)

**변경 후**:
```javascript
app.post('/api/evals/:id/submit', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.id);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (!['draft'].includes(ev.phase))
      return res.status(409).json({ error: '제출 불가 상태: ' + ev.phase });

    const { self_reason } = req.body;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await evalCycleRepo.updatePhaseAndReason(req.params.id, {
      phase: 'pending',
      self_reason: self_reason || '',
      submitted_at: now
    });
    // goals 테이블 update는 추후 Goal Repository 도입 후 이관
    db.prepare("UPDATE goals SET status='pending' WHERE eval_id=?").run(req.params.id);

    const targetUser = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.sub);
    auditLog(req.user.sub, 'GOAL_SUBMITTED', ev.id, targetUser?.name, 
      `목표 승인 요청 제출 (${ev.period_label||''})`, req.ip);
    res.json({ success: true });
  } catch(err) {
    console.error('[submit]', err);
    res.status(500).json({ error: err.message });
  }
});
```

**주의 사항**:
- goals 테이블 직접 조작은 일단 유지 (Goal Repository는 PROMPT 41에서 처리)
- 감사 로그는 라우터에 유지 (38 패턴과 동일)
- ev.user_id 비교 시 String 통일

---

## 검증 절차

### 1. Prisma 클라이언트 재생성 확인
```powershell
npx prisma generate
```
오류 없이 완료 확인.

### 2. 서버 정상 기동
```powershell
taskkill /IM node.exe /F
node server\index.js
```

### 3. 시나리오별 브라우저 검증

`dev3@synapsoft.com` / `user1234` 로그인하여 검증.

| 시나리오 | 동작 | 기대 결과 |
|----------|------|-----------|
| A. 평가 목록 조회 | 내 평가 페이지 진입 | 기존 평가 목록 정상 표시 |
| B. 신규 평가 생성 | 신규 평가 시작 | 정상 생성, draft 상태 |
| C. 중복 생성 방지 | 다시 신규 평가 시도 | 기존 draft 평가 ID 반환 (새로 안 만들어짐) |
| D. 목표 작성 후 제출 | 목표 입력 → 자기평가 사유 입력 → 제출 | phase=pending, self_reason 암호화 저장 |
| E. 권한별 마스킹 | sales1로 로그인하여 dev3의 평가 조회 시도 | self_reason이 null로 표시되거나 접근 거부 |
| F. 반려 후 재오픈 | 관리자가 반려 → 본인이 재오픈 | phase=draft, reject_reason=null |

### 4. F12 Network 탭으로 응답 구조 확인

각 API 응답이 기존 형식과 100% 일치하는지:
- `user_id`, `user_name`, `dept` 등 snake_case 필드 존재
- `self_reason`, `reject_reason`이 복호화된 평문으로 반환 (권한 있을 때)
- `period_type`, `period_label`, `eval_year` 정상

### 5. 암호화 검증 (중요)

Prisma Studio로 DB 직접 확인:
```powershell
npx prisma studio
```

- `eval_cycles` 테이블의 `self_reason` 컬럼에 **암호문 형식** (`hex:hex`)으로 저장되어 있어야 함
- 평문이 저장되어 있으면 암호화 실패

---

## 완료 후 처리

### 1. ClaudeHRM.md 갱신

"최근 개발 이력" 표 상단에 한 줄 추가:
```
| 2026-05-18 | PROMPT 40-A: EvalCycle Repository 어댑터 + 라우터 4개 전환 (암호화 자동 처리, 권한 체크 isInApproverChain 도입) | Claude Code |
```

"파일 구조"에 신규 파일 추가:
```
server/repositories/EvalCycleRepository.js
server/adapters/prisma/PrismaEvalCycleRepository.js
```

"핵심 설계 원칙"에 추가:
```
- 암호화 필드 자동 처리: Repository가 저장 시 암호화, 조회 시 복호화. 라우터는 평문만 다룸
- 승인자 체인 탐색: userRepo.isInApproverChain(approverId, targetUserId) 사용
```

### 2. 커밋 + 푸시

```powershell
git add prisma/schema.prisma
git add server/repositories/EvalCycleRepository.js
git add server/adapters/prisma/PrismaEvalCycleRepository.js
git add server/repositories/UserRepository.js
git add server/adapters/prisma/PrismaUserRepository.js
git add server/config/repository-factory.js
git add server/index.js
git add ClaudeHRM.md
git add prompts/CLAUDE_CODE_PROMPT_40-A.md
git commit -m "feat(repository): EvalCycle Repository Pattern 적용 - 핵심 4개 라우터 (PROMPT 40-A)"
git push
```

---

## 작업 시 주의사항

- **암호화 시크릿 일치 필수**: Repository의 `_encrypt()`/`_decrypt()`가 server/index.js의 기존 `encrypt()`/`decrypt()`와 정확히 동일한 알고리즘과 시크릿 사용해야 함. 기존 데이터 호환성 유지
- **외래키 Number() 변환**: `userId`, `id` 등 모든 외래키는 `Number()` 변환 (이전 38 후속 사고 방지)
- **goals 테이블 조작은 보존**: PROMPT 41(Goal Repository)에서 정식 이관. 지금은 `db.prepare(...)` 직접 호출 유지
- **응답 형식 호환성**: snake_case 필드명, user_name/dept 평탄화 필수. 클라이언트 코드 변경 없이 작동해야 함
- **권한 체크 변경 금지**: 라우터의 권한 마스킹 로직(isAdmin/isOwner/isApprover)은 그대로 유지. Repository는 항상 평문 반환, 마스킹은 라우터에서

---

## 다음 작업 예고

### PROMPT 40-B (40-A 검증 완료 후)
- GET /api/evals/my-history (527줄)
- GET /api/evals/my-mgr-pending (1921줄)
- Goal/Approval 어댑터 일부 선행 필요

### PROMPT 41
- Goal Repository (`/api/evals/:id/goals`)
- 암호화 필드 2개 (name, kpi)
- GoalCategory 관계
