# PROMPT 43: Feedback Repository 어댑터

> 작성일: 2026-05-19
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 42 완료 (push)
> 패턴: 41 (Goal) 패턴 확장 — Aggregate Root (feedbacks + feedback_items)
> 위험도: 중상 (암호화 3개 필드, 2개 테이블, 트랜잭션)
> 예상 소요: 1.5시간
> 저장 위치: prompts/CLAUDE_CODE_PROMPT_43.md

---

## 배경

Repository Pattern 적용 도메인이 6개(User, GoalCategory, GradeCriteria, Organization, EvalCycle, Goal) 누적되었습니다. 이번에는 **2개 테이블을 함께 다루는 Aggregate Root 패턴**인 Feedback으로 진입합니다.

### 41과의 차이점

| 항목 | 41 (Goal) | 43 (Feedback) |
|------|-----------|---------------|
| 테이블 | 1개 (goals) | **2개 (feedbacks + feedback_items)** |
| 암호화 필드 | name, kpi | **overall_note, note, goal.name (참조)** |
| 관계 | category | **users + goals (참조)** |
| POST 동작 | DELETE + 일괄 INSERT | **INSERT 1 + 일괄 INSERT N** |
| 권한 마스킹 | 단순 | **author 본인 + 승인자 체인 + Owner** |

---

## 작업 범위

### 처리 라우터 2개
- `GET /api/feedback/:evalId` (818줄) — 조회 + 권한별 마스킹
- `POST /api/feedback/:evalId` (833줄) — 트랜잭션 일괄 저장

### 신규 생성 파일 (2개)
- `server/repositories/FeedbackRepository.js`
- `server/adapters/prisma/PrismaFeedbackRepository.js`

### 수정 파일 (3개)
- `prisma/schema.prisma` — Feedback, FeedbackItem relation 추가
- `server/config/repository-factory.js` — getFeedbackRepository 추가
- `server/index.js` — 라우터 2개 전환

---

## 설계 결정 사항

### 1. 단일 Repository, 두 테이블 처리 (Aggregate Root 패턴)
`FeedbackRepository`가 `feedbacks` + `feedback_items` 모두 처리. 항상 함께 조회/저장되므로 합치는 게 자연스러움.

### 2. 트랜잭션
POST의 "feedbacks INSERT + items 일괄 INSERT"는 Prisma `$transaction`.

### 3. 암호화 자동 처리
40-A, 41 패턴 그대로. Repository가 저장 시 자동 암호화, 조회 시 자동 복호화.

### 4. goal_name 처리 — 단순화 옵션 A 채택
feedback_items에 표시되는 goal_name은 Goal 도메인이지만, 이번엔 FeedbackRepository가 JOIN으로 함께 가져옴. 향후 GoalRepository로 분리 가능.

### 5. 권한별 마스킹은 라우터에
Repository는 항상 평문 반환. 라우터가:
- `overall_note`: admin/owner/작성자 본인만 → 그 외 `null`
- `note`: admin/owner만 → 그 외 `null`
- `goal_name`: admin/owner만 → 그 외 `'***'`

---

## 작업 지시

### 1단계 — schema.prisma에 Feedback, FeedbackItem relation 추가

`prisma/schema.prisma`의 Feedback 모델(103~110줄)에 관계 추가:

**기존**:
```prisma
model Feedback {
  id          Int     @id @default(autoincrement())
  evalId      Int     @map("eval_id")
  authorId    Int     @map("author_id")
  overallNote String? @map("overall_note")
  created_at  String?

  @@map("feedbacks")
}
```

**변경 후**:
```prisma
model Feedback {
  id          Int     @id @default(autoincrement())
  evalId      Int     @map("eval_id")
  authorId    Int     @map("author_id")
  overallNote String? @map("overall_note")
  created_at  String?

  // === PROMPT 43 추가 ===
  evalCycle   EvalCycle      @relation("EvalCycleFeedbacks", fields: [evalId], references: [id])
  author      User           @relation("UserAuthoredFeedbacks", fields: [authorId], references: [id])
  items       FeedbackItem[] @relation("FeedbackToItems")

  @@map("feedbacks")
}
```

### 1-1단계 — FeedbackItem 모델에 관계 추가

```prisma
model FeedbackItem {
  id         Int     @id @default(autoincrement())
  feedbackId Int     @map("feedback_id")
  goalId     Int     @map("goal_id")
  score      Int?
  note       String?
  created_at String?

  // === PROMPT 43 추가 ===
  feedback   Feedback @relation("FeedbackToItems", fields: [feedbackId], references: [id])
  goal       Goal     @relation("GoalFeedbackItems", fields: [goalId], references: [id])

  @@map("feedback_items")
}
```

### 1-2단계 — EvalCycle 모델에 역방향 관계 추가

기존 EvalCycle 모델의 relation 영역에 추가:

```prisma
model EvalCycle {
  // ... 기존 필드들
  user         User    @relation("UserEvalCycles", fields: [userId], references: [id])
  goals        Goal[]  @relation("EvalCycleGoals")
  // === PROMPT 43 추가 ===
  feedbacks    Feedback[] @relation("EvalCycleFeedbacks")

  @@map("eval_cycles")
}
```

### 1-3단계 — User 모델에 역방향 관계 추가

```prisma
model User {
  // ... 기존 필드들
  organization     Organization?  @relation("OrgMembers", fields: [orgId], references: [id])
  ledOrganizations Organization[] @relation("OrgLeader")
  evalCycles       EvalCycle[]    @relation("UserEvalCycles")
  // === PROMPT 43 추가 ===
  authoredFeedbacks Feedback[]    @relation("UserAuthoredFeedbacks")

  @@map("users")
}
```

### 1-4단계 — Goal 모델에 역방향 관계 추가

```prisma
model Goal {
  // ... 기존 필드들
  evalCycle  EvalCycle    @relation("EvalCycleGoals", fields: [evalId], references: [id])
  category   GoalCategory @relation("GoalCategoryGoals", fields: [categoryId], references: [id])
  // === PROMPT 43 추가 ===
  feedbackItems FeedbackItem[] @relation("GoalFeedbackItems")

  @@map("goals")
}
```

### 1-5단계 — Prisma Client 재생성

```powershell
npx prisma generate
```

---

### 2단계 — FeedbackRepository 인터페이스 생성

`server/repositories/FeedbackRepository.js`:

```javascript
/**
 * FeedbackRepository — 피드백 데이터 접근 인터페이스 (Aggregate Root)
 * feedbacks + feedback_items 두 테이블을 함께 처리.
 * 암호화 필드: overall_note, note, goal.name (참조)
 */
class FeedbackRepository {
  /**
   * 평가 사이클별 피드백 목록 조회 (items 포함, author 정보 포함)
   * Repository는 항상 평문 반환. 권한별 마스킹은 라우터에서.
   * @param {number} evalId
   * @returns {Promise<Array>} 피드백 배열, 각 항목에 items 배열 포함
   *   { id, eval_id, author_id, author_name, overall_note(평문), created_at, items: [{...}] }
   */
  async findByEvalId(evalId) {
    throw new Error('FeedbackRepository.findByEvalId is not implemented');
  }

  /**
   * 피드백 생성 (트랜잭션: feedbacks INSERT + items 일괄 INSERT)
   * Repository가 자동 암호화 처리.
   * @param {Object} data { eval_id, author_id, overall_note(평문), items: [{goal_id, score, note(평문)}] }
   * @returns {Promise<number>} 생성된 feedback.id
   */
  async create(data) {
    throw new Error('FeedbackRepository.create is not implemented');
  }
}

module.exports = FeedbackRepository;
```

---

### 3단계 — PrismaFeedbackRepository 구현체 생성

`server/adapters/prisma/PrismaFeedbackRepository.js`:

```javascript
const FeedbackRepository = require('../../repositories/FeedbackRepository');
const crypto = require('crypto');

class PrismaFeedbackRepository extends FeedbackRepository {
  constructor(prismaClient, encSecret) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaFeedbackRepository requires a prismaClient instance');
    }
    if (!encSecret) {
      throw new Error('PrismaFeedbackRepository requires encSecret');
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
  _flattenFeedback(fb) {
    if (!fb) return null;
    const { author, items, evalId, authorId, overallNote, ...rest } = fb;
    return {
      ...rest,
      eval_id: evalId,
      author_id: authorId,
      author_name: author?.name || null,
      overall_note: overallNote ? this._decrypt(overallNote) : '',
      items: (items || []).map(it => this._flattenItem(it))
    };
  }

  _flattenItem(it) {
    if (!it) return null;
    const { goal, feedbackId, goalId, note, ...rest } = it;
    return {
      ...rest,
      feedback_id: feedbackId,
      goal_id: goalId,
      note: note ? this._decrypt(note) : '',
      goal_name: goal?.name ? this._decrypt(goal.name) : null
    };
  }

  async findByEvalId(evalId) {
    const feedbacks = await this.prisma.feedback.findMany({
      where: { evalId: Number(evalId) },
      include: {
        author: { select: { name: true } },
        items: {
          include: {
            goal: { select: { name: true } }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
    return feedbacks.map(fb => this._flattenFeedback(fb));
  }

  async create(data) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. feedback 생성 (overall_note 암호화)
      const fb = await tx.feedback.create({
        data: {
          evalId: Number(data.eval_id),
          authorId: Number(data.author_id),
          overallNote: this._encrypt(data.overall_note || '')
        }
      });
      // 2. items 일괄 생성 (note 암호화)
      if (data.items && data.items.length > 0) {
        for (const it of data.items) {
          await tx.feedbackItem.create({
            data: {
              feedbackId: fb.id,
              goalId: Number(it.goal_id),
              score: it.score !== undefined && it.score !== null ? Number(it.score) : null,
              note: this._encrypt(it.note || '')
            }
          });
        }
      }
      return fb.id;
    });
  }
}

module.exports = PrismaFeedbackRepository;
```

---

### 4단계 — 팩토리 갱신

`server/config/repository-factory.js`에 추가:

```javascript
const FeedbackRepository = require('../repositories/FeedbackRepository');
const PrismaFeedbackRepository = require('../adapters/prisma/PrismaFeedbackRepository');

function getFeedbackRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  return new PrismaFeedbackRepository(getSharedPrismaClient(), encSecret);
}

// exports에 추가
module.exports = {
  // ... 기존
  getFeedbackRepository,
  FeedbackRepository,
  PrismaFeedbackRepository
};
```

---

### 5단계 — server/index.js 라우터 2개 전환

#### 5-1. 상단 import 추가

```javascript
const {
  // ... 기존
  getFeedbackRepository,  // ← 추가
} = require('./config/repository-factory');

// ...
const feedbackRepo = getFeedbackRepository();  // ← 추가
```

#### 5-2. GET /api/feedback/:evalId (818줄 근처)

**변경 후**:
```javascript
app.get('/api/feedback/:evalId', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '없음' });
    
    const isAdmin = ['master','admin'].includes(req.user.role);
    const isOwner = String(ev.user_id) === String(req.user.sub);
    
    // Repository에서 평문 반환받기
    const fbs = await feedbackRepo.findByEvalId(req.params.evalId);
    
    // 권한별 마스킹 (라우터 책임)
    fbs.forEach(fb => {
      const isAuthor = String(fb.author_id) === String(req.user.sub);
      // overall_note: admin/owner/작성자 본인만 허용
      if (!isAdmin && !isOwner && !isAuthor) {
        fb.overall_note = null;
      }
      // items: admin/owner만 허용
      fb.items.forEach(it => {
        if (!isAdmin && !isOwner) {
          it.note = null;
          it.goal_name = '***';
        }
      });
    });
    
    res.json(fbs);
  } catch(err) {
    console.error('[GET /api/feedback/:evalId]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 5-3. POST /api/feedback/:evalId (833줄 근처)

**변경 후**:
```javascript
app.post('/api/feedback/:evalId', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev || !['approved','final_self','final_mgr_pending'].includes(ev.phase))
      return res.status(400).json({ error: '승인된 평가에만 피드백 가능' });
    
    const { overall_note, items } = req.body;
    const newId = await feedbackRepo.create({
      eval_id: req.params.evalId,
      author_id: req.user.sub,
      overall_note: overall_note || '',
      items: items || []
    });
    
    // 감사 로그
    const targetUserName = ev.user_name;
    auditLog(req.user.sub, 'FEEDBACK_SUBMITTED', ev.user_id, targetUserName,
      `중간 피드백 제출 (평가ID: ${req.params.evalId})`, req.ip);
    
    res.json({ id: newId });
  } catch(err) {
    console.error('[POST /api/feedback/:evalId]', err);
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

### 3. 브라우저 검증 — 데이터 호환성 (최우선)

`dev1@synapsoft.com / user1234` 로그인 (dev3의 상사).

| 단계 | 동작 | 기대 결과 |
|------|------|----------|
| 3-1 | 피드백 메뉴 → dev3 카드 펼치기 | 정상 |
| 3-2 | **기존에 작성한 피드백 이력** 확인 | **goal_name, overall_note, note 모두 평문 정상 표시** |
| 3-3 | 별점 + 피드백 입력 후 제출 | 정상 저장 |
| 3-4 | 새로고침 후 다시 확인 | 방금 작성한 피드백이 평문으로 표시 |

**가장 위험한 검증은 3-2**입니다. 기존 암호화 피드백 데이터가 정상 복호화되어야 합니다. `[복호화 오류]` 보이면 즉시 멈춤.

### 4. 받는 사람 입장 검증

`dev3@synapsoft.com / user1234` 로그인.

| 단계 | 동작 | 기대 결과 |
|------|------|----------|
| 4-1 | 피드백 메뉴 → 받은 피드백 탭 | dev1이 작성한 피드백 정상 표시 |
| 4-2 | goal_name, overall_note, note | 모두 평문 (Owner라 마스킹 안 됨) |

### 5. 권한 마스킹 검증 (선택)

`sales1@synapsoft.com / user1234` 로그인 (dev3와 무관한 사용자).

dev3의 평가 피드백에 접근 시도 → 권한 없으므로 403 또는 마스킹된 데이터.

### 6. 암호화 검증 (Prisma Studio)

```powershell
npx prisma studio
```

- `feedbacks.overall_note` → 암호문 형식 (`hex:hex`)
- `feedback_items.note` → 암호문 형식

---

## 완료 후 처리

### 1. ClaudeHRM.md 갱신

"최근 개발 이력" 표 상단:
```
| 2026-05-19 | PROMPT 43: Feedback Repository 어댑터 (Aggregate Root: feedbacks + feedback_items, 암호화 3개 필드) | Claude Code |
```

"파일 구조"에 신규 파일 2개 추가.

### 2. 커밋 + 푸시

```powershell
git add prisma/schema.prisma
git add server/repositories/FeedbackRepository.js
git add server/adapters/prisma/PrismaFeedbackRepository.js
git add server/config/repository-factory.js
git add server/index.js
git add ClaudeHRM.md
git add prompts/CLAUDE_CODE_PROMPT_43.md
git commit -m "feat(repository): Feedback Repository Pattern 적용 - Aggregate Root (PROMPT 43)"
git push
```

---

## 작업 시 주의사항

- **암호화 알고리즘 일치 필수** — 40-A, 41 패턴 그대로
- **외래키 Number() 변환** — `evalId`, `authorId`, `goalId` 등 모두 `Number()`
- **트랜잭션 내부 순차 처리** — `$transaction` 내부 `for` 루프로 items 순차 create
- **score는 null 허용** — 별점 안 주고 텍스트만 입력하는 경우 score는 null
- **클라이언트 호환성 필수** — `eval_id`, `author_id`, `author_name`, `goal_name`, `overall_note`, `note` 등 snake_case 필드명 유지
- **권한 마스킹 위치** — Repository는 항상 평문, 마스킹은 라우터에서
- **author 본인 권한 추가** — overall_note는 작성자 본인도 항상 볼 수 있음 (`isAuthor`)
- **schema.prisma 관계명** — 양방향 모두 정확히 일치 필수

---

## 다음 작업 예고

### PROMPT 40-B — EvalCycle 나머지 (my-history, my-mgr-pending)
- Feedback이 정리됐으니 깔끔하게 작업 가능

### PROMPT 44 — FinalEvaluation Repository
- 암호화 필드 3개 (self_note, mgr_note, second_mgr_note)
- final_eval_scores 함께 처리

### PROMPT 45 — ProgressReport Repository
- 중간 보고 (PROMPT 42에서 본 내용)
- 암호화 필드 1개 (content)

### INFRA-2 — PostgreSQL 도입
