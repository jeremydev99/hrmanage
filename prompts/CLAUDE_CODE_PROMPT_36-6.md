# 작업 36-6: GoalCategory 어댑터 + 4개 라우터 전환

> 작성일: 2026-05-14
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 36-1 (Prisma 도입), 36-2 (정합성), 36-3 (마케팅), 36-4 (Repository 골격 + User), 36-5 (Prisma 5 문서 정리) 모두 완료
> 목적: Repository Pattern 두 번째 도메인 어댑터 구현 — GoalCategory (CRUD 완전 전환)
> 위험도: 중 (4개 라우터 변경, CRUD 패턴 첫 적용)
> 후속 작업: PROMPT 36-7 (GradeCriteria 어댑터 — 같은 패턴 반복)

---

## 배경

36-4에서 User 어댑터로 Repository Pattern 골격을 검증했음. 그러나 36-4는 **조회 1개 라우터**만 전환된 상태. 이번 36-6은 **완전 CRUD (Create, Read, Update, Delete)** 패턴을 첫 적용하는 단계.

GoalCategory 선택 이유:
- 정적 데이터 (자주 변경 안 됨, 안전)
- 다른 테이블 참조 없음 (트랜잭션 불필요)
- 암호화 필드 없음 (decrypt 호출 없음)
- CRUD 4개 라우터 모두 단순 (특수 로직 없음)
- 관리자 페이지의 "카테고리 관리" 탭에서 즉시 검증 가능

---

## 전환 대상 라우터 (정확한 코드)

server/index.js에서 다음 4개 라우터를 Repository 호출로 전환:

### 1. GET /api/categories (인증만 필요)
```javascript
// 현재 (전환 전)
app.get('/api/categories', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM goal_categories WHERE is_active=1 ORDER BY sort_order').all());
});
```

### 2. POST /api/categories (admin+)
```javascript
// 현재 (전환 전)
app.post('/api/categories', auth, adminOnly, (req, res) => {
  const { name, description, weight, color, text_color, sort_order } = req.body;
  const r = db.prepare(
    'INSERT INTO goal_categories(name,description,weight,color,text_color,sort_order,created_by) VALUES(?,?,?,?,?,?,?)'
  ).run(name, description||'', weight||0, color||'#E6F1FB', text_color||'#0C447C', sort_order||0, req.user.sub);
  res.json({ id: r.lastInsertRowid });
});
```

### 3. PUT /api/categories/:id (admin+)
```javascript
// 현재 (전환 전)
app.put('/api/categories/:id', auth, adminOnly, (req, res) => {
  const { name, description, weight, color, text_color, sort_order, is_active } = req.body;
  db.prepare('UPDATE goal_categories SET name=?,description=?,weight=?,color=?,text_color=?,sort_order=?,is_active=? WHERE id=?')
    .run(name, description, weight, color, text_color, sort_order, is_active??1, req.params.id);
  res.json({ success: true });
});
```

### 4. DELETE /api/categories/:id (master만, soft delete)
```javascript
// 현재 (전환 전)
app.delete('/api/categories/:id', auth, masterOnly, (req, res) => {
  db.prepare('UPDATE goal_categories SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});
```

---

## 작업 전 확인사항

1. 현재 브랜치가 `feat/prisma-orm`인지 확인 (`git branch`)
2. `git status`가 깨끗한지 확인 (36-5까지 모두 commit/push 완료)
3. CLAUDE.md, ClaudeHRM.md 먼저 읽기
4. 기존 시스템이 정상 동작하는지 확인 (`node server/index.js` → http://localhost:3000 → 로그인 가능)
5. 36-4에서 만든 server/repositories/, adapters/, config/ 폴더가 존재하는지 확인

작업 시작 전 위 5가지 모두 통과해야 함. 하나라도 안 되면 작업 중단하고 사용자에게 보고.

---

## 작업 1: GoalCategoryRepository.js 인터페이스 생성

### 파일: `server/repositories/GoalCategoryRepository.js`

```javascript
/**
 * GoalCategoryRepository — 목표 카테고리 데이터 접근 인터페이스
 *
 * goal_categories 테이블 추상화.
 * 실제 구현은 server/adapters/{어댑터}/PrismaGoalCategoryRepository.js 등에 위치.
 *
 * 컬럼 매핑 (snake_case 응답 기준):
 *   id, name, description, weight, color, text_color,
 *   sort_order, is_active, created_by, created_at
 */
class GoalCategoryRepository {
  /**
   * 활성 카테고리 전체 목록 (sort_order 오름차순)
   * @returns {Promise<Array>} 카테고리 객체 배열
   */
  async findAllActive() {
    throw new Error('GoalCategoryRepository.findAllActive is not implemented');
  }

  /**
   * 새 카테고리 추가
   * @param {object} data - {name, description, weight, color, text_color, sort_order, created_by}
   * @returns {Promise<number>} 생성된 ID
   */
  async create(data) {
    throw new Error('GoalCategoryRepository.create is not implemented');
  }

  /**
   * 카테고리 수정 (전체 필드)
   * @param {number} id - 카테고리 ID
   * @param {object} data - {name, description, weight, color, text_color, sort_order, is_active}
   * @returns {Promise<boolean>} 성공 여부
   */
  async update(id, data) {
    throw new Error('GoalCategoryRepository.update is not implemented');
  }

  /**
   * 카테고리 비활성화 (soft delete)
   * @param {number} id - 카테고리 ID
   * @returns {Promise<boolean>} 성공 여부
   */
  async deactivate(id) {
    throw new Error('GoalCategoryRepository.deactivate is not implemented');
  }
}

module.exports = GoalCategoryRepository;
```

---

## 작업 2: PrismaGoalCategoryRepository.js 구현

### 파일: `server/adapters/prisma/PrismaGoalCategoryRepository.js`

```javascript
const GoalCategoryRepository = require('../../repositories/GoalCategoryRepository');

/**
 * Prisma의 camelCase 응답을 기존 server/index.js와 호환되는 snake_case로 변환
 */
function toSnakeCase(cat) {
  if (!cat) return cat;
  return {
    id: cat.id,
    name: cat.name,
    description: cat.description,
    weight: cat.weight,
    color: cat.color,
    text_color: cat.textColor,
    sort_order: cat.sortOrder,
    is_active: cat.isActive,
    created_by: cat.created_by,
    created_at: cat.created_at,
  };
}

/**
 * Prisma 기반 GoalCategoryRepository 구현체
 */
class PrismaGoalCategoryRepository extends GoalCategoryRepository {
  constructor(prismaClient) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaGoalCategoryRepository requires a prismaClient instance');
    }
    this.prisma = prismaClient;
  }

  async findAllActive() {
    const categories = await this.prisma.goalCategory.findMany({
      where: { isActive: 1 },
      orderBy: { sortOrder: 'asc' }
    });
    return categories.map(toSnakeCase);
  }

  async create(data) {
    const created = await this.prisma.goalCategory.create({
      data: {
        name: data.name,
        description: data.description || '',
        weight: data.weight || 0,
        color: data.color || '#E6F1FB',
        textColor: data.text_color || '#0C447C',
        sortOrder: data.sort_order || 0,
        created_by: data.created_by,
      }
    });
    return created.id;
  }

  async update(id, data) {
    await this.prisma.goalCategory.update({
      where: { id: Number(id) },
      data: {
        name: data.name,
        description: data.description,
        weight: data.weight,
        color: data.color,
        textColor: data.text_color,
        sortOrder: data.sort_order,
        isActive: data.is_active ?? 1,
      }
    });
    return true;
  }

  async deactivate(id) {
    await this.prisma.goalCategory.update({
      where: { id: Number(id) },
      data: { isActive: 0 }
    });
    return true;
  }
}

module.exports = PrismaGoalCategoryRepository;
```

⚠️ **주의 사항**:
- Prisma 모델명: `goalCategory` (lowercase + camelCase). schema.prisma의 `model GoalCategory`를 lowercase로.
- camelCase 매핑: `text_color` → `textColor`, `sort_order` → `sortOrder`, `is_active` → `isActive` (schema.prisma의 `@map`에 따라)
- `created_at` 컬럼은 schema.prisma에서 `String? @default("datetime('now')")`로 설정되어 있어 자동 처리

---

## 작업 3: repository-factory.js에 GoalCategory 추가

### 파일: `server/config/repository-factory.js` 수정

기존 파일에 다음 두 가지 추가:

#### 3-1) require 추가 (상단)

```javascript
const PrismaGoalCategoryRepository = require('../adapters/prisma/PrismaGoalCategoryRepository');
```

#### 3-2) getGoalCategoryRepository 함수 추가

```javascript
function getGoalCategoryRepository() {
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaGoalCategoryRepository(getSharedPrismaClient());
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}
```

#### 3-3) module.exports 갱신

```javascript
module.exports = {
  getUserRepository,
  getGoalCategoryRepository,  // ← 추가
  getSharedPrismaClient,
};
```

---

## 작업 4: server/index.js의 4개 라우터 전환

### Step 4-1: 상단 require에 추가

기존 `const { getUserRepository } = require('./config/repository-factory');` 줄을 다음으로 교체:

```javascript
// Repository Pattern
const { 
  getUserRepository, 
  getGoalCategoryRepository 
} = require('./config/repository-factory');
const userRepo = getUserRepository();
const goalCategoryRepo = getGoalCategoryRepository();
```

### Step 4-2: GET /api/categories 전환

`/api/categories` 라우터 4개가 모인 섹션 찾기:

```bash
findstr /n "/api/categories" server\index.js
```

**현재 코드를 주석으로 보존 + 새 코드 추가**:

```javascript
// [PROMPT_36-6] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.get('/api/categories', auth, (req, res) => {
//   res.json(db.prepare('SELECT * FROM goal_categories WHERE is_active=1 ORDER BY sort_order').all());
// });

// [PROMPT_36-6] Repository Pattern 적용
app.get('/api/categories', auth, async (req, res) => {
  try {
    const categories = await goalCategoryRepo.findAllActive();
    res.json(categories);
  } catch (e) {
    console.error('[GET /api/categories]', e);
    res.status(500).json({ error: 'Server error' });
  }
});
```

### Step 4-3: POST /api/categories 전환

```javascript
// [PROMPT_36-6] Repository Pattern 전환 — 기존 코드 주석 처리
// app.post('/api/categories', auth, adminOnly, (req, res) => {
//   const { name, description, weight, color, text_color, sort_order } = req.body;
//   const r = db.prepare(
//     'INSERT INTO goal_categories(name,description,weight,color,text_color,sort_order,created_by) VALUES(?,?,?,?,?,?,?)'
//   ).run(name, description||'', weight||0, color||'#E6F1FB', text_color||'#0C447C', sort_order||0, req.user.sub);
//   res.json({ id: r.lastInsertRowid });
// });

// [PROMPT_36-6] Repository Pattern 적용
app.post('/api/categories', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, weight, color, text_color, sort_order } = req.body;
    const id = await goalCategoryRepo.create({
      name,
      description,
      weight,
      color,
      text_color,
      sort_order,
      created_by: req.user.sub,
    });
    res.json({ id });
  } catch (e) {
    console.error('[POST /api/categories]', e);
    res.status(500).json({ error: 'Server error' });
  }
});
```

### Step 4-4: PUT /api/categories/:id 전환

```javascript
// [PROMPT_36-6] Repository Pattern 전환 — 기존 코드 주석 처리
// app.put('/api/categories/:id', auth, adminOnly, (req, res) => {
//   const { name, description, weight, color, text_color, sort_order, is_active } = req.body;
//   db.prepare('UPDATE goal_categories SET name=?,description=?,weight=?,color=?,text_color=?,sort_order=?,is_active=? WHERE id=?')
//     .run(name, description, weight, color, text_color, sort_order, is_active??1, req.params.id);
//   res.json({ success: true });
// });

// [PROMPT_36-6] Repository Pattern 적용
app.put('/api/categories/:id', auth, adminOnly, async (req, res) => {
  try {
    await goalCategoryRepo.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    console.error('[PUT /api/categories/:id]', e);
    res.status(500).json({ error: 'Server error' });
  }
});
```

### Step 4-5: DELETE /api/categories/:id 전환

```javascript
// [PROMPT_36-6] Repository Pattern 전환 — 기존 코드 주석 처리
// app.delete('/api/categories/:id', auth, masterOnly, (req, res) => {
//   db.prepare('UPDATE goal_categories SET is_active=0 WHERE id=?').run(req.params.id);
//   res.json({ success: true });
// });

// [PROMPT_36-6] Repository Pattern 적용
app.delete('/api/categories/:id', auth, masterOnly, async (req, res) => {
  try {
    await goalCategoryRepo.deactivate(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('[DELETE /api/categories/:id]', e);
    res.status(500).json({ error: 'Server error' });
  }
});
```

---

## 작업 5: 자체 테스트 스크립트로 검증

작업 후 임시 테스트 스크립트 작성:

### 파일: `test-goal-category-repo.js` (임시, 작업 후 삭제)

```javascript
require('dotenv').config();
const { 
  getGoalCategoryRepository, 
  getSharedPrismaClient 
} = require('./server/config/repository-factory');

(async () => {
  try {
    const repo = getGoalCategoryRepository();
    console.log('=== Repository 인스턴스 생성 OK ===');

    // 1. 조회 테스트
    const categories = await repo.findAllActive();
    console.log('=== findAllActive 결과 ===');
    console.log(`카테고리 수: ${categories.length}`);
    if (categories[0]) {
      console.log('첫 번째 카테고리:', JSON.stringify(categories[0], null, 2));
      console.log('text_color 필드 존재?', 'text_color' in categories[0], '(snake_case 변환 확인)');
      console.log('sort_order 필드 존재?', 'sort_order' in categories[0], '(snake_case 변환 확인)');
    }

    await getSharedPrismaClient().$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('에러:', e);
    process.exit(1);
  }
})();
```

### 실행

```bash
node test-goal-category-repo.js
```

기대 결과:
- `=== Repository 인스턴스 생성 OK ===`
- `카테고리 수: N` (N은 1 이상)
- 첫 번째 카테고리 정보 출력
- `text_color`, `sort_order` 필드가 snake_case로 표시

테스트 통과 후:
```bash
del test-goal-category-repo.js
```

### ⚠️ CRUD 테스트 안 함

자체 테스트에서는 **읽기만 검증**:
- create/update/deactivate는 실제 데이터를 변경하므로 자동 테스트 위험
- 사용자가 브라우저 관리자 페이지에서 직접 검증 (다음 섹션)

---

## 작업 6: 문서 업데이트

### 6-1) ClaudeHRM.md 최근 개발 이력 표 최상단에 추가

```
| 2026-05-14 | GoalCategory 어댑터 + /api/categories 4개 라우터 전환 (PROMPT_36-6) | Claude Code |
```

### 6-2) ClaudeHRM.md 파일 구조 섹션 갱신

기존 server/repositories/, adapters/prisma/ 항목에 새 파일 추가:

```
├── server/
│   ├── repositories/
│   │   ├── README.md
│   │   ├── UserRepository.js
│   │   └── GoalCategoryRepository.js    ← NEW
│   ├── adapters/
│   │   └── prisma/
│   │       ├── README.md
│   │       ├── PrismaUserRepository.js
│   │       └── PrismaGoalCategoryRepository.js  ← NEW
│   └── config/
│       └── repository-factory.js  (수정)
```

### 6-3) ClaudeHRM.md 마케팅 포인트 섹션 갱신

"기술 스택 차별화" 항목의 멀티 DB 지원 줄 갱신:

```markdown
- [x] **멀티 DB 지원 아키텍처** — Prisma ORM 5.x + Repository Pattern 적용 (User, GoalCategory 어댑터 완료)
  - 추가 어댑터(PostgreSQL/MySQL/MSSQL/Oracle 등) 확장 가능
  - 환경변수 한 줄(DATA_ADAPTER)로 어댑터 전환
  - CRUD 패턴 검증 완료 (조회/생성/수정/비활성화)
```

---

## 작업 7: 자동 git 커밋

```bash
cd C:\claudeprojects\hrmanage
git add server/repositories/ server/adapters/ server/config/ server/index.js ClaudeHRM.md
git commit -m "GoalCategory 어댑터 + /api/categories 4개 라우터 전환 (PROMPT_36-6)"
```

**push는 사용자가 직접 실행** (PROMPT 35 규칙 엄수).

---

## 작업 완료 후 보고할 내용

1. **생성된 파일** (2개): GoalCategoryRepository.js, PrismaGoalCategoryRepository.js
2. **수정된 파일** (3개): repository-factory.js, server/index.js, ClaudeHRM.md
3. **전환된 라우터** (4개): GET, POST, PUT, DELETE `/api/categories`
4. **자체 테스트 결과** (test-goal-category-repo.js):
   - findAllActive 카테고리 수
   - 첫 번째 카테고리의 snake_case 필드 확인
5. **자동 커밋 해시**
6. **사용자가 직접 할 일** (다음 섹션 참조)

---

## 사용자 검증 체크리스트 (반드시 수행)

### Step 1: 서버 시작 — 에러 없는지

```powershell
node server/index.js
```

**기대 결과**: 평소처럼 시작. 에러 메시지 없음.

**포트 충돌 시** (이전 작업의 잔여 프로세스):
```powershell
netstat -ano | findstr :3000
taskkill /F /PID <PID>
```

### Step 2: 관리자 로그인

브라우저 http://localhost:3000 → `ceo@synapsoft.com` / `admin1234` 로그인

관리자 페이지 진입 → 카테고리 관리 탭

### Step 3: 4가지 동작 검증

**3-1) 조회 (GET /api/categories)**
- 카테고리 목록이 화면에 정상 표시되나?
- 색상, 이름, 가중치 등이 올바르게 보이나?
- sort_order 순서대로 정렬되어 있나?

**3-2) 추가 (POST /api/categories)**
- "새 카테고리 추가" 버튼 클릭
- 임시 이름 "테스트 카테고리" 입력
- 저장 클릭
- 목록에 즉시 추가되나?

**3-3) 수정 (PUT /api/categories/:id)**
- 방금 추가한 "테스트 카테고리" 클릭
- 이름을 "테스트 카테고리 수정됨"으로 변경
- 저장 클릭
- 목록에 수정된 이름으로 표시되나?

**3-4) 삭제 (DELETE /api/categories/:id, master 권한 필요)**
- "테스트 카테고리 수정됨" 옆 삭제 버튼 클릭
- 목록에서 사라지나? (실제로는 is_active=0으로 변경됨)
- 다른 페이지 갔다가 돌아와도 안 보이나?

### Step 4: 다른 페이지 영향 없는지 확인

- dev3로 로그인 → 평가 작성 → **카테고리 드롭다운**에 카테고리들이 정상 표시되나?
- 기존 평가들이 정상 표시되나?
- 다른 기능 (피드백, 최종평가) 영향 없나?

### Step 5: 이상 없으면 push

```powershell
git push
```

---

## 예상 문제와 대처

| 증상 | 원인 | 해결 |
|------|------|------|
| `Cannot find module '../adapters/prisma/PrismaGoalCategoryRepository'` | 파일 생성 실패 또는 경로 오류 | 파일 존재 확인, require 경로 확인 |
| `goalCategoryRepo.findAllActive is not a function` | 팩토리 export 오류 | repository-factory.js의 module.exports 확인 |
| `prisma.goalCategory is undefined` | 모델명 오류 | Prisma는 lowercase 사용. `goalCategory` (camelCase) 맞음 |
| `Cannot read property 'goalCategory' of undefined` | Prisma Client 미생성 | `npx prisma generate` 실행 |
| 카테고리 추가는 되는데 목록에 안 보임 | is_active 기본값 누락 | DB에 INSERT 시 is_active 명시 또는 schema 기본값 확인 |
| 응답 필드가 camelCase로 옴 | toSnakeCase 누락 | findAllActive에서 map(toSnakeCase) 확인 |
| 클라이언트가 카테고리 색상 안 보임 | text_color 필드명 깨짐 | toSnakeCase에서 textColor → text_color 변환 확인 |

---

## ⚠️ 절대 하지 말 것

- ❌ **다른 라우터 (`/api/users`, `/api/evals` 등) 같이 수정** — 이번 PROMPT 범위 외
- ❌ **기존 `db.prepare()` 코드 삭제** — 다른 라우터가 여전히 사용
- ❌ **`npx prisma db push`, `migrate reset` 실행** — DB 변경 금지
- ❌ **schema.prisma 수정** — 이번 PROMPT 범위 외
- ❌ **자동 git push 실행** — 사용자가 직접 (PROMPT 35 규칙)
- ❌ **CRUD 자동 테스트로 데이터 변경** — 자체 테스트는 읽기만, 사용자가 브라우저로 검증
- ❌ **GradeCriteria 어댑터 같이 작업** — 36-7로 분리

---

## 향후 작업 예고 — PROMPT 36-7

36-6 검증 완료되면 같은 패턴으로:
- GradeCriteriaRepository.js + PrismaGradeCriteriaRepository.js
- `/api/grade-criteria` 4개 라우터 전환
- 관리자 페이지의 "등급 기준 관리" 탭에서 검증
