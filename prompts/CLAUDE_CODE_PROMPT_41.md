# PROMPT 41: Goal Repository 어댑터

> 작성일: 2026-05-19
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 40-A 완료 (8bffbe4 push), INFRA-1 완료 (0d140f5 push)
> 패턴: 40-A EvalCycle 패턴 확장 (암호화 2개 필드, GoalCategory 관계)
> 위험도: 중상 (암호화 필드 2개, 트랜잭션, 관계 처리)
> 예상 소요: 1.5시간
> 저장 위치: prompts/CLAUDE_CODE_PROMPT_41.md

---

## 배경

Repository Pattern 적용 도메인이 5개(User, GoalCategory, GradeCriteria, Organization, EvalCycle) 누적되었습니다. 이번에는 **가장 자주 호출되고 가장 중요한 비즈니스 객체**인 Goal로 진입합니다.

**40-A (EvalCycle)과의 차이점**:

| 항목 | 40-A (EvalCycle) | 41 (Goal) |
|------|-----------|-----------|
| 암호화 필드 | 2개 (self_reason, reject_reason) | **2개 (name, kpi)** |
| 관계 | User (1-way) | **GoalCategory (JOIN 필수)** + EvalCycle |
| POST 동작 | 단일 UPDATE | **트랜잭션 (DELETE + 일괄 INSERT)** |
| 권한 마스킹 | null 처리 | **'***' 처리** |
| 호출 빈도 | 중 | **높음 (목표 작성/조회 시마다)** |

---

## 작업 범위

### 처리 라우터 2개
- `GET /api/evals/:id/goals` (445줄) — 조회 + 권한별 마스킹
- `POST /api/evals/:id/goals` (467줄) — 트랜잭션 일괄 저장

### 신규 생성 파일 (2개)
- `server/repositories/GoalRepository.js` (인터페이스)
- `server/adapters/prisma/PrismaGoalRepository.js` (Prisma 구현체)

### 수정 파일 (3개)
- `server/config/repository-factory.js` — getGoalRepository 추가
- `server/index.js` — 라우터 2개 전환 + reopen/submit 라우터의 goals 업데이트 부분도 이관
- `prisma/schema.prisma` — Goal 모델에 EvalCycle, GoalCategory relation 추가

---

## 설계 결정 사항

### 1. 암호화 자동 처리
EvalCycle 패턴 그대로. Repository가 저장 시 자동 암호화, 조회 시 자동 복호화.

### 2. JOIN 처리
Prisma `include`로 `category`와 `evalCycle` 관계 포함. `_flatten()`으로 `cat_name`, `color`, `text_color` 평탄화.

### 3. 트랜잭션
POST의 "기존 goals 삭제 + 새 goals 일괄 추가"는 Prisma `$transaction`으로 처리. 원자성 보장.

### 4. 권한 마스킹은 라우터에
Repository는 항상 평문 반환. 라우터가 권한 확인 후 `'***'` 처리.

### 5. goals 상태 변경은 별도 메서드
`reopen`, `submit` 라우터의 `UPDATE goals SET status=...` 부분을 `updateStatusByEvalId()` 메서드로 이관.

---

## 작업 지시

### 1단계 — schema.prisma에 Goal relation 추가

`prisma/schema.prisma`의 Goal 모델(62~75줄)에 관계 추가.

**기존**:
```prisma
model Goal {
  id         Int     @id @default(autoincrement())
  evalId     Int     @map("eval_id")
  categoryId Int     @map("category_id")
  name       String?
  kpi        String?
  weight     Int?    @default(0)
  sortOrder  Int?    @default(0) @map("sort_order")
  status     String? @default("draft")
  created_at String?

  @@map("goals")
}
```

**변경 후**:
```prisma
model Goal {
  id         Int     @id @default(autoincrement())
  evalId     Int     @map("eval_id")
  categoryId Int     @map("category_id")
  name       String?
  kpi        String?
  weight     Int?    @default(0)
  sortOrder  Int?    @default(0) @map("sort_order")
  status     String? @default("draft")
  created_at String?

  // === explicit relations (PROMPT 41 추가) ===
  evalCycle  EvalCycle    @relation("EvalCycleGoals", fields: [evalId], references: [id])
  category   GoalCategory @relation("GoalCategoryGoals", fields: [categoryId], references: [id])

  @@map("goals")
}
```

### 1-1단계 — EvalCycle 모델에 역방향 관계 추가

EvalCycle 모델(43~60줄)에 goals 추가:

```prisma
model EvalCycle {
  // ... 기존 필드들

  // === explicit relations ===
  user         User    @relation("UserEvalCycles", fields: [userId], references: [id])
  // === PROMPT 41 추가 ===
  goals        Goal[]  @relation("EvalCycleGoals")

  @@map("eval_cycles")
}
```

### 1-2단계 — GoalCategory 모델에 역방향 관계 추가

GoalCategory 모델(76~88줄)에 goals 추가:

```prisma
model GoalCategory {
  // ... 기존 필드들

  // === PROMPT 41 추가 ===
  goals       Goal[]  @relation("GoalCategoryGoals")

  @@map("goal_categories")
}
```

### 1-3단계 — Prisma Client 재생성

```powershell
npx prisma generate
```

오류 없이 완료되면 다음으로.

---

### 2단계 — GoalRepository 인터페이스 생성

`server/repositories/GoalRepository.js`:

```javascript
/**
 * GoalRepository — 목표 데이터 접근 인터페이스
 * goals 테이블 추상화.
 * 암호화 필드: name, kpi (저장/조회 시 자동 처리)
 * 관계: evalCycle (필수), category (필수)
 */
class GoalRepository {
  /**
   * 평가 사이클별 목표 목록 조회
   * (암호화 필드 자동 복호화, category 정보 포함)
   * @param {number} evalId - 평가 사이클 ID
   * @returns {Promise<Array>} 목표 객체 배열
   *   각 항목: { ...goal, name, kpi (복호화), cat_name, color, text_color }
   */
  async findByEvalId(evalId) {
    throw new Error('GoalRepository.findByEvalId is not implemented');
  }

  /**
   * 평가 사이클의 모든 목표 삭제 후 새 목표들 일괄 저장 (트랜잭션)
   * @param {number} evalId - 평가 사이클 ID
   * @param {Array} goals - 목표 객체 배열 [{ category_id, name, kpi, weight }]
   */
  async replaceByEvalId(evalId, goals) {
    throw new Error('GoalRepository.replaceByEvalId is not implemented');
  }

  /**
   * 평가 사이클의 모든 목표 상태 일괄 변경
   * @param {number} evalId - 평가 사이클 ID
   * @param {string} status - 새 상태 ('draft', 'pending', 'approved' 등)
   */
  async updateStatusByEvalId(evalId, status) {
    throw new Error('GoalRepository.updateStatusByEvalId is not implemented');
  }
}

module.exports = GoalRepository;
```

---

### 3단계 — PrismaGoalRepository 구현체 생성

`server/adapters/prisma/PrismaGoalRepository.js`:

```javascript
const GoalRepository = require('../../repositories/GoalRepository');
const crypto = require('crypto');

class PrismaGoalRepository extends GoalRepository {
  constructor(prismaClient, encSecret) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaGoalRepository requires a prismaClient instance');
    }
    if (!encSecret) {
      throw new Error('PrismaGoalRepository requires encSecret for encryption');
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
   * Prisma 응답을 기존 SQL 결과 호환 형태로 평탄화
   * - camelCase → snake_case
   * - category 관계 → cat_name, color, text_color 평탄화
   * - 암호화 필드 자동 복호화
   */
  _flatten(g) {
    if (!g) return null;
    const { category, evalCycle, evalId, categoryId, sortOrder, name, kpi, ...rest } = g;
    return {
      ...rest,
      eval_id: evalId,
      category_id: categoryId,
      sort_order: sortOrder,
      name: name ? this._decrypt(name) : '',
      kpi: kpi ? this._decrypt(kpi) : '',
      cat_name: category?.name || null,
      color: category?.color || null,
      text_color: category?.textColor || null
    };
  }

  async findByEvalId(evalId) {
    const goals = await this.prisma.goal.findMany({
      where: { evalId: Number(evalId) },
      include: {
        category: { select: { name: true, color: true, textColor: true, sortOrder: true } }
      },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { sortOrder: 'asc' }
      ]
    });
    return goals.map(g => this._flatten(g));
  }

  async replaceByEvalId(evalId, goals) {
    // Prisma 트랜잭션으로 원자성 보장
    await this.prisma.$transaction(async (tx) => {
      // 1. 기존 goals 전체 삭제
      await tx.goal.deleteMany({
        where: { evalId: Number(evalId) }
      });
      // 2. 새 goals 일괄 추가 (createMany 또는 순차 create)
      if (goals && goals.length > 0) {
        const data = goals.map((g, i) => ({
          evalId: Number(evalId),
          categoryId: Number(g.category_id),
          name: this._encrypt(g.name || ''),
          kpi: this._encrypt(g.kpi || ''),
          weight: Number(g.weight) || 0,
          sortOrder: i,
          status: 'draft'
        }));
        // SQLite는 createMany 일부 옵션 미지원이라 안전하게 순차 create
        for (const item of data) {
          await tx.goal.create({ data: item });
        }
      }
    });
  }

  async updateStatusByEvalId(evalId, status) {
    await this.prisma.goal.updateMany({
      where: { evalId: Number(evalId) },
      data: { status }
    });
  }
}

module.exports = PrismaGoalRepository;
```

**주의 사항**:
- 암호화 시크릿(`encSecret`)을 생성자로 주입받음 (40-A 패턴 동일)
- `createMany`는 SQLite에서 일부 옵션이 제한적이라 순차 `create` 사용 (트랜잭션 내부)
- `_flatten()`으로 클라이언트 호환성 유지

---

### 4단계 — 팩토리 갱신

`server/config/repository-factory.js`에 추가:

```javascript
const GoalRepository = require('../repositories/GoalRepository');
const PrismaGoalRepository = require('../adapters/prisma/PrismaGoalRepository');

function getGoalRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  return new PrismaGoalRepository(getSharedPrismaClient(), encSecret);
}

// exports에 추가
module.exports = {
  // ... 기존
  getGoalRepository,
  GoalRepository,
  PrismaGoalRepository
};
```

---

### 5단계 — server/index.js 라우터 전환

#### 5-1. 상단 import 추가

기존 require 부분에 `getGoalRepository` 추가:

```javascript
const {
  getUserRepository,
  getGoalCategoryRepository,
  getGradeCriteriaRepository,
  getOrganizationRepository,
  getEvalCycleRepository,
  getGoalRepository,  // ← 추가
} = require('./config/repository-factory');

// ... 기존 코드
const goalRepo = getGoalRepository();  // ← 추가
```

#### 5-2. GET /api/evals/:id/goals (445줄 근처)

**변경 후**:
```javascript
app.get('/api/evals/:id/goals', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: '없음' });
    
    const isAdmin = ['master','admin'].includes(req.user.role);
    const isOwner = String(ev.user_id) === String(req.user.sub);
    const isApprover = isOwner ? false : await userRepo.isInApproverChain(req.user.sub, ev.user_id);
    const canSee = isAdmin || isOwner || isApprover;
    if (!canSee) return res.status(403).json({ error: '권한 없음' });
    
    const goals = await goalRepo.findByEvalId(req.params.id);
    const canDecrypt = isAdmin || isOwner || isApprover;
    
    // 권한별 마스킹 (canSee=true니까 canDecrypt도 true. 항상 평문)
    // 다만 향후 권한 세분화 대비하여 마스킹 로직 유지
    if (!canDecrypt) {
      goals.forEach(g => { g.name = '***'; g.kpi = '***'; });
    }
    
    res.json(goals);
  } catch(err) {
    console.error('[GET /api/evals/:id/goals]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 5-3. POST /api/evals/:id/goals (467줄 근처)

**변경 후**:
```javascript
app.post('/api/evals/:id/goals', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.id);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (['approved','final_self','final_mgr_pending','final_done'].includes(ev.phase))
      return res.status(409).json({ error: '승인된 평가는 수정할 수 없습니다.' });
    
    const { goals, self_reason } = req.body;
    
    // 1. goals 일괄 교체 (Repository 내부 트랜잭션)
    await goalRepo.replaceByEvalId(req.params.id, goals || []);
    
    // 2. self_reason 업데이트 (EvalCycle Repository 사용)
    if (self_reason !== undefined) {
      await evalCycleRepo.updatePhaseAndReason(req.params.id, {
        phase: ev.phase,  // phase 변경 없음
        self_reason: self_reason
      });
    }
    
    res.json({ success: true });
  } catch(err) {
    console.error('[POST /api/evals/:id/goals]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 5-4. PATCH /api/evals/:id/reopen (495줄 근처) — Goal 부분 이관

**기존**:
```javascript
await evalCycleRepo.reopen(ev.id);
db.prepare("UPDATE goals SET status='draft' WHERE eval_id=?").run(ev.id);  // ← 이 줄
```

**변경 후**:
```javascript
await evalCycleRepo.reopen(ev.id);
await goalRepo.updateStatusByEvalId(ev.id, 'draft');  // ← Repository로
```

#### 5-5. POST /api/evals/:id/submit (511줄 근처) — Goal 부분 이관

**기존**:
```javascript
await evalCycleRepo.updatePhaseAndReason(...);
db.prepare("UPDATE goals SET status='pending' WHERE eval_id=?").run(req.params.id);  // ← 이 줄
```

**변경 후**:
```javascript
await evalCycleRepo.updatePhaseAndReason(...);
await goalRepo.updateStatusByEvalId(req.params.id, 'pending');  // ← Repository로
```

---

## 검증 절차

### 1. Prisma 재생성
```powershell
npx prisma generate
```

### 2. Docker 컨테이너 재빌드 (Docker 사용 시)
```powershell
docker-compose down
docker-compose build
docker-compose up
```

또는 일반 실행:
```powershell
taskkill /IM node.exe /F
node server\index.js
```

### 3. 브라우저 검증

`dev3@synapsoft.com / user1234` 로그인.

| 단계 | 동작 | 기대 결과 |
|------|------|----------|
| 3-1 | 내 평가 목록 → 평가 클릭 | 기존 목표들 정상 표시 (cat_name, color 포함) |
| 3-2 | 평가 도중인 draft 평가가 있으면 목표 수정 | 정상 저장 |
| 3-3 | 신규 평가 시작 → 카테고리별로 목표 1~2개 입력 | 정상 저장 (트랜잭션) |
| 3-4 | 자기평가 사유 입력 후 제출 | phase=pending, goals status=pending |
| 3-5 | F12 Network 탭에서 응답 확인 | name, kpi 평문, cat_name 정상 |

### 4. 암호화 검증 (Prisma Studio)

```powershell
npx prisma studio
```

- `goals` 테이블의 `name`, `kpi` 컬럼이 **암호문 형식**(`hex:hex`)으로 저장됐는지 확인

### 5. 권한별 마스킹 검증 (선택)

- sales1로 로그인하여 dev3의 평가 상세 접근 시도
- 권한 없으면 403 응답
- 권한 있으면 평문 반환

### 6. 데이터 호환성 검증 (중요)

기존에 작성된 평가의 목표가 정상 복호화되는지:
- 이전 평가들의 목표 이름과 KPI가 평문으로 정상 표시되어야 함
- `[복호화 오류]`로 보이면 즉시 중단하고 보고

---

## 완료 후 처리

### 1. ClaudeHRM.md 갱신

"최근 개발 이력" 표 상단:
```
| 2026-05-19 | PROMPT 41: Goal Repository 어댑터 + 라우터 2개 전환 (암호화 2개 필드, 트랜잭션 일괄 저장) | Claude Code |
```

"파일 구조"에 신규 파일 추가.

"핵심 설계 원칙"에 추가:
```
- Goal 트랜잭션 일괄 교체: goalRepo.replaceByEvalId(evalId, goals) — DELETE + 일괄 INSERT 원자성 보장
- Goal 상태 일괄 변경: goalRepo.updateStatusByEvalId(evalId, status)
```

### 2. 커밋 + 푸시

```powershell
git add prisma/schema.prisma
git add server/repositories/GoalRepository.js
git add server/adapters/prisma/PrismaGoalRepository.js
git add server/config/repository-factory.js
git add server/index.js
git add ClaudeHRM.md
git add prompts/CLAUDE_CODE_PROMPT_41.md
git commit -m "feat(repository): Goal Repository Pattern 적용 (PROMPT 41)"
git push
```

---

## 작업 시 주의사항

- **암호화 알고리즘 일치 필수**: Repository의 `_encrypt()/_decrypt()`가 server/index.js의 기존 `encrypt()/decrypt()`와 bit-perfect 동일해야 함. 40-A 패턴 그대로
- **외래키 Number() 변환**: `evalId`, `categoryId` 등 모든 외래키는 `Number()` 변환
- **트랜잭션 내부 순차 처리**: `createMany` 대신 트랜잭션 내 순차 `create`로 안전성 확보
- **클라이언트 호환성**: `cat_name`, `color`, `text_color`, `eval_id`, `category_id` snake_case 필드 유지
- **권한 체크 변경 금지**: 라우터의 권한 체크 로직 그대로
- **schema.prisma 관계명 일치**: `EvalCycleGoals`, `GoalCategoryGoals` 양쪽 모델 모두 정확히 일치

---

## 다음 작업 예고

### PROMPT 42 — GoalApproval Repository (승인 도메인)
- /api/approvals/* 라우터들
- 암호화 필드: note
- 승인 체인 처리

### PROMPT 40-B — EvalCycle 나머지 라우터
- /api/evals/my-history (Goal + GoalApproval 의존)
- /api/evals/my-mgr-pending
- Goal Repository가 완성되어 깔끔하게 작업 가능
