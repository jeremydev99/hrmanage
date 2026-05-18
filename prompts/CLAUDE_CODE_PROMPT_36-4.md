# 작업 36-4: Repository Pattern 골격 + User 어댑터 구현

> 작성일: 2026-05-14
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 36-1 (Prisma 도입), 36-2 (정합성 정리), 36-3 (마케팅 포인트) 모두 완료
> 목적: DB 추상화 계층 구축 — 다양한 DB 어댑터 추가 가능한 구조 확립
> 위험도: 중상 (server/index.js의 실제 로직을 처음 변경)
> 후속 작업: PROMPT 36-5 (나머지 라우터 점진 전환)

---

## 배경 — 왜 이걸 하는가

본인 시스템을 **B2B SaaS 제품**으로 만들기 위한 핵심 단계입니다.

### 현재 상태 (Phase 1 ~ 36-2)
- 모든 DB 호출이 `better-sqlite3` 직접 사용
- SQLite 전용 SQL 문법으로 작성됨
- 다른 DB로 옮기려면 코드 수천 줄 수정 필요

### 목표 상태 (Repository Pattern 완료 후)
- 애플리케이션 코드는 "사용자 조회해줘" 같은 추상적 호출만
- 실제 DB 호출은 어댑터 계층이 담당
- DB 종류 추가/교체 시 어댑터 한 개만 추가하면 됨
- 멀티 DB 지원 = 마케팅 포인트 ⭐

### 이번 36-4에서 만들 것
- 추상화 골격 (인터페이스 + 팩토리)
- **User 어댑터 한 개**만 구현 (가장 단순한 영역)
- **라우터 한 개**만 전환 (`GET /api/auth/me` — 단순 조회)
- 나머지는 모두 기존 better-sqlite3 그대로 (점진 전환)

---

## 작업 전 확인사항

1. 현재 브랜치가 `feat/prisma-orm`인지 확인 (`git branch`)
2. `git status`가 깨끗한지 확인 (이전 작업 모두 commit/push 완료)
3. CLAUDE.md, ClaudeHRM.md 먼저 읽기
4. 기존 시스템이 정상 동작하는지 확인 (`node server/index.js` → http://localhost:3000 → dev3 로그인)

작업 시작 전 위 4가지 모두 통과해야 함. 하나라도 안 되면 작업 중단하고 사용자에게 보고.

---

## 작업 1: 폴더 구조 생성

다음 폴더와 파일 생성:

```
server/
├── index.js                       (기존, 거의 안 건드림)
├── repositories/                  ← NEW
│   ├── README.md                  ← 폴더 설명
│   └── UserRepository.js          ← User 인터페이스 정의
├── adapters/                      ← NEW
│   └── prisma/
│       ├── README.md              ← 폴더 설명
│       └── PrismaUserRepository.js ← Prisma 기반 User 구현
└── config/                        ← NEW (또는 기존 있으면 추가)
    └── repository-factory.js      ← 어댑터 선택 로직
```

### 1-1) `server/repositories/README.md` 생성

```markdown
# Repositories — DB 추상화 인터페이스

이 폴더는 데이터 접근 계층의 **인터페이스(계약)** 만 정의합니다.
실제 DB 호출 구현은 `server/adapters/` 안의 어댑터에서 합니다.

## 원칙
- 각 파일은 하나의 도메인 객체에 대한 Repository 클래스
- 메서드는 `throw new Error('미구현')`만 던지는 추상 메서드
- DB 종류와 무관한 시그니처 (예: `findById(id)`, `findByEmail(email)`)
- 향후 멀티테넌시 도입 시 `tenantId` 파라미터 추가 예정 (현재는 미포함)

## 사용 예시
```javascript
const { getUserRepository } = require('../config/repository-factory');
const userRepo = getUserRepository();
const user = await userRepo.findById(1);
```

## 어떤 어댑터가 실행되는지
환경변수 `DATA_ADAPTER`로 결정 (기본: `prisma`)
```

### 1-2) `server/repositories/UserRepository.js` 생성

```javascript
/**
 * UserRepository — 사용자 데이터 접근 인터페이스
 *
 * 이 클래스는 추상 인터페이스이며, 실제 구현은
 * server/adapters/{어댑터명}/PrismaUserRepository.js 등에서 합니다.
 *
 * 새 어댑터 추가 방법:
 *   1. server/adapters/{새어댑터}/ 폴더 생성
 *   2. 이 클래스를 상속한 구현 클래스 작성
 *   3. config/repository-factory.js에 분기 추가
 */
class UserRepository {
  /**
   * ID로 사용자 조회
   * @param {number} id - 사용자 ID
   * @returns {Promise<object|null>} 사용자 객체 또는 null
   */
  async findById(id) {
    throw new Error('UserRepository.findById is not implemented');
  }

  /**
   * 이메일로 사용자 조회 (로그인 시 사용)
   * @param {string} email - 이메일
   * @returns {Promise<object|null>}
   */
  async findByEmail(email) {
    throw new Error('UserRepository.findByEmail is not implemented');
  }

  /**
   * 활성 사용자 전체 목록
   * @returns {Promise<Array>}
   */
  async findAllActive() {
    throw new Error('UserRepository.findAllActive is not implemented');
  }
}

module.exports = UserRepository;
```

### 1-3) `server/adapters/prisma/README.md` 생성

```markdown
# Prisma Adapter

이 폴더는 Prisma ORM을 사용하여 Repository 인터페이스를 구현합니다.

## 지원 DB
schema.prisma의 `provider` 설정에 따름:
- 현재: `sqlite`
- 운영 예정: `postgresql`
- 추후 확장: `mysql`, `sqlserver`

## 사용 시 주의
- 이 어댑터는 `generated/prisma/` 의 PrismaClient를 사용
- Prisma Studio 등 다른 도구와 같은 DB를 공유
- 트랜잭션이 필요한 경우 `prisma.$transaction()` 사용
- Prisma는 camelCase 필드명 반환 — 기존 snake_case 호환 위해 변환 함수 사용
```

### 1-4) `server/adapters/prisma/PrismaUserRepository.js` 생성

```javascript
const UserRepository = require('../../repositories/UserRepository');

/**
 * Prisma의 camelCase 응답을 기존 server/index.js와 호환되는 snake_case로 변환
 * 기존 코드는 user.manager_id, user.is_active 형태로 접근하므로
 * 클라이언트 측 호환성 유지를 위해 필요
 */
function toSnakeCase(user) {
  if (!user) return user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password_hash: user.passwordHash,
    role: user.role,
    dept: user.dept,
    title: user.title,
    manager_id: user.managerId,
    is_active: user.isActive,
    account_status: user.accountStatus,
    signup_note: user.signupNote,
    grade: user.grade,
    eval_mode: user.evalMode,
    org_id: user.orgId,
    created_at: user.created_at,
  };
}

/**
 * Prisma 기반 UserRepository 구현체
 */
class PrismaUserRepository extends UserRepository {
  constructor(prismaClient) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaUserRepository requires a prismaClient instance');
    }
    this.prisma = prismaClient;
  }

  async findById(id) {
    if (!id) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: Number(id) }
    });
    return toSnakeCase(user);
  }

  async findByEmail(email) {
    if (!email) return null;
    const user = await this.prisma.user.findUnique({
      where: { email: String(email) }
    });
    return toSnakeCase(user);
  }

  async findAllActive() {
    const users = await this.prisma.user.findMany({
      where: { isActive: 1 },
      orderBy: { id: 'asc' }
    });
    return users.map(toSnakeCase);
  }
}

module.exports = PrismaUserRepository;
```

### 1-5) `server/config/repository-factory.js` 생성

```javascript
/**
 * Repository Factory — 환경변수에 따라 적절한 어댑터를 선택
 *
 * 환경변수:
 *   DATA_ADAPTER=prisma (기본값)
 *   향후 추가 예정: direct-sql, mongo, external-api 등
 */

const PrismaUserRepository = require('../adapters/prisma/PrismaUserRepository');
// 향후 추가:
// const DirectSqlUserRepository = require('../adapters/direct-sql/DirectSqlUserRepository');

const ADAPTER = process.env.DATA_ADAPTER || 'prisma';

// PrismaClient 인스턴스 공유 (싱글톤)
let sharedPrismaClient = null;
function getSharedPrismaClient() {
  if (!sharedPrismaClient) {
    const { PrismaClient } = require('../../generated/prisma');
    sharedPrismaClient = new PrismaClient();
  }
  return sharedPrismaClient;
}

function getUserRepository() {
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaUserRepository(getSharedPrismaClient());
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

module.exports = {
  getUserRepository,
  getSharedPrismaClient,
  // 향후 추가:
  // getGoalRepository,
  // getEvalRepository,
};
```

---

## 작업 2: server/index.js의 라우터 1개만 전환

### 전환 대상: `GET /api/auth/me`

이 라우터를 선택한 이유:
- 가장 단순한 조회 (`req.user.id` 받아서 사용자 정보 반환)
- 트랜잭션 없음
- 다른 테이블 참조 없음
- 로그인된 사용자가 사용하는 자주 호출되는 라우터
- 실패 시 영향 범위가 명확 (사용자 정보 조회만 영향)

### 작업 절차

#### Step 2-1: server/index.js 상단에 require 추가

기존 require 문 근처(상단)에 추가:

```javascript
// Repository Pattern (PROMPT 36-4 도입)
const { getUserRepository } = require('./config/repository-factory');
const userRepo = getUserRepository();
```

⚠️ **위치 중요**: 기존 `const db = require('better-sqlite3')...` 줄 **이후**, 또는 다른 require 묶음 끝에.

⚠️ **기존 db 변수는 그대로 유지**. 다른 라우터가 여전히 사용.

#### Step 2-2: `/api/auth/me` 라우터 위치 찾기

```bash
findstr /n "/api/auth/me" server\index.js
```

이 명령으로 줄 번호 찾기. 파일 안에 라우터가 어디 정의되어 있는지 확인.

#### Step 2-3: 기존 코드를 주석으로 보존 + 새 코드 작성

기존 라우터 위에 주석으로 보존하고 새 버전 작성:

```javascript
// [PROMPT_36-4] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.get('/api/auth/me', requireAuth, (req, res) => {
//   const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
//   if (!user) return res.status(404).json({ error: 'User not found' });
//   delete user.password_hash;
//   res.json(user);
// });

// [PROMPT_36-4] Repository Pattern 적용
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await userRepo.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    delete user.password_hash;
    res.json(user);
  } catch (e) {
    console.error('[/api/auth/me]', e);
    res.status(500).json({ error: 'Server error' });
  }
});
```

⚠️ **실제 기존 코드는 이것과 다를 수 있음**. 반드시 파일 내용을 먼저 확인하고, 그 코드를 정확히 주석 처리한 뒤 새 코드 작성.

### 핵심 변경 사항 체크리스트

- [x] `(req, res) =>` → `async (req, res) =>` (async 추가)
- [x] `db.prepare().get()` → `await userRepo.findById()`
- [x] try-catch로 에러 처리 감싸기
- [x] 응답 필드명: snake_case 그대로 (PrismaUserRepository에서 변환됨)
- [x] 기존 코드는 주석으로 보존

---

## 작업 3: 빠른 동작 테스트 (코드 작성 후, 사용자 검증 전)

Claude Code가 작업 완료 후 다음 명령으로 자체 검증:

```bash
# 1. 문법 검사
node --check server/index.js

# 2. 임시 테스트 스크립트 작성
```

`test-user-repo.js` 임시 생성:

```javascript
require('dotenv').config();
const { getUserRepository, getSharedPrismaClient } = require('./server/config/repository-factory');

(async () => {
  try {
    const userRepo = getUserRepository();
    console.log('=== Repository 인스턴스 생성 OK ===');
    
    const user = await userRepo.findById(6);
    console.log('=== findById(6) 결과 ===');
    console.log(JSON.stringify(user, null, 2));
    
    const userByEmail = await userRepo.findByEmail('dev3@synapsoft.com');
    console.log('=== findByEmail(dev3) 결과 ===');
    console.log('name:', userByEmail?.name);
    console.log('manager_id:', userByEmail?.manager_id, '(snake_case 변환 확인)');
    
    await getSharedPrismaClient().$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('에러:', e);
    process.exit(1);
  }
})();
```

실행:
```bash
node test-user-repo.js
```

기대 결과:
- `=== Repository 인스턴스 생성 OK ===`
- 한개발 사용자 정보가 출력
- `manager_id` 필드가 정상 표시 (camelCase가 아닌 snake_case)

테스트 끝나면:
```bash
del test-user-repo.js
```

이 테스트 결과를 사용자에게 보고에 포함.

---

## 작업 4: 문서 업데이트

### 4-1) ClaudeHRM.md 최근 개발 이력 표 최상단에 추가

```
| 2026-05-14 | Repository Pattern 골격 + User 어댑터 + /api/auth/me 라우터 전환 (PROMPT_36-4) | Claude Code |
```

### 4-2) ClaudeHRM.md 핵심 설계 원칙 섹션 마지막에 추가

```markdown
17. **Repository Pattern 적용** (2026-05-14, PROMPT_36-4):
    - DB 호출은 `server/repositories/`의 인터페이스를 통해
    - 실제 구현은 `server/adapters/{어댑터}/`에 위치
    - 환경변수 `DATA_ADAPTER`로 어댑터 선택 (기본: prisma)
    - 새 DB 지원 시 어댑터 추가만 하면 됨 (인터페이스/라우터 변경 불필요)
    - 향후 멀티테넌시 도입 시 메서드 시그니처에 `tenantId` 추가
    - Prisma의 camelCase 응답을 기존 snake_case로 자동 변환 (toSnakeCase 헬퍼)
```

### 4-3) ClaudeHRM.md 파일 구조 섹션에 추가

기존 server/ 항목 아래에 추가:

```
├── server/
│   ├── index.js
│   ├── repositories/           ← NEW: DB 추상화 인터페이스
│   │   ├── README.md
│   │   └── UserRepository.js
│   ├── adapters/               ← NEW: DB 어댑터 구현
│   │   └── prisma/
│   │       ├── README.md
│   │       └── PrismaUserRepository.js
│   └── config/                 ← NEW: 어댑터 선택 로직
│       └── repository-factory.js
```

### 4-4) ClaudeHRM.md 환경변수 섹션에 추가

기존 .env 변수 표에 한 행 추가:

```
| DATA_ADAPTER | DB 어댑터 선택 | prisma |
```

### 4-5) ClaudeHRM.md 마케팅 포인트 섹션 업데이트

"기술 스택 차별화" 항목의 첫 번째 줄을 다음으로 업데이트:

```markdown
- [x] **멀티 DB 지원 아키텍처** — Prisma ORM + Repository Pattern 골격 구축 완료 (User 어댑터 기준)
  - 추가 어댑터(PostgreSQL/MySQL/MSSQL/Oracle 등) 확장 가능
  - 환경변수 한 줄(DATA_ADAPTER)로 어댑터 전환
```

---

## 작업 5: 자동 git 커밋

```bash
cd C:\claudeprojects\hrmanage
git add server/repositories/ server/adapters/ server/config/ server/index.js ClaudeHRM.md
git commit -m "Repository Pattern 골격 + User 어댑터 + /api/auth/me 전환 (PROMPT_36-4)"
```

**push는 사용자가 직접 실행** (PROMPT 35 규칙).

---

## 작업 완료 후 보고할 내용

1. **생성된 파일 목록** (5개: README 2개 + 코드 3개)
2. **수정된 파일** (server/index.js의 `/api/auth/me` 라우터 부분, ClaudeHRM.md)
3. **변경된 라우터 — 전후 코드 비교 5~10줄 정도**
4. **server/index.js 상단 require 부분에 추가된 줄**
5. **자체 테스트 결과** — `test-user-repo.js` 실행 결과
6. **자동 커밋 해시**
7. **사용자가 직접 할 일** (다음 섹션 참조)

---

## 사용자 검증 체크리스트 (반드시 수행)

### Step 1: 서버 시작 — 에러 없는지

```powershell
node server/index.js
```

**기대 결과**: 평소처럼 시작. 에러 메시지 없음.

**실패 시**: 콘솔 에러 메시지 그대로 알려주세요.

### Step 2: 로그인 — 일반 사용자

브라우저 http://localhost:3000 → `dev3@synapsoft.com` / `user1234` 로그인

**기대 결과**: 정상 로그인. 메인 화면 진입.

**실패 시**: 브라우저 개발자 도구(F12) → Network 탭 → `/api/auth/me` 호출 응답 확인

### Step 3: `/api/auth/me` 동작 확인

로그인 후 브라우저 개발자 도구 Console에서:

```javascript
fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('synap_token') } }).then(r => r.json()).then(console.log)
```

**기대 결과**:
```json
{
  "id": 6,
  "name": "한개발",
  "email": "dev3@synapsoft.com",
  "manager_id": 4,
  "is_active": 1,
  ...
}
```

`manager_id`, `is_active`, `org_id` 등이 **snake_case로 정상 반환**되는지 확인.

### Step 4: 다른 기능들도 정상 동작

- 평가 페이지 진입
- 관리자 페이지 진입 (다른 계정으로 로그인)
- AI 요약 생성

**모두 정상 작동해야 함** (`/api/auth/me`만 Prisma로 전환됐고 나머지는 그대로)

### Step 5: 이상 없으면 push

```powershell
git push
```

---

## 예상 문제와 대처

| 증상 | 원인 | 해결 |
|------|------|------|
| `Cannot find module '../../generated/prisma'` | Prisma Client 경로 오류 | `npx prisma generate` 재실행 |
| `userRepo.findById is not a function` | 팩토리 export 오류 | repository-factory.js 확인 |
| 로그인 후 빈 화면 또는 오류 | `/api/auth/me` 응답 형식 깨짐 | 응답 JSON 형식 확인 (snake_case 변환 필요) |
| `prisma.user.findUnique is not a function` | 모델명 오류 (User vs user) | Prisma는 lowercase 사용. `prisma.user`가 맞음 |
| 다른 라우터 깨짐 | 안 건드린 라우터인데 깨짐 = 작업 중 실수 | 작업 내역 재확인 |
| 응답이 빈 객체 `{}` | toSnakeCase가 null 받음 | findById에서 사용자 못 찾은 케이스 |

---

## ⚠️ 절대 하지 말 것

- ❌ 다른 라우터 (`/api/users`, `/api/evals`, `/api/auth/login` 등) 같이 수정 — 이번 PROMPT 범위 외
- ❌ 기존 `db.prepare()` 코드 삭제 — 다른 라우터가 여전히 사용
- ❌ `npx prisma db push`, `migrate reset` — DB 변경 금지
- ❌ 데이터 변환 추측 작업 — 본인이 보고 결정해야 함
- ❌ `requireAuth` 함수 시그니처 변경 — 기존 미들웨어 그대로 사용

---

## 향후 작업 예고 (36-5 이후)

이번 36-4에서 만든 골격을 기반으로:

- 36-5: GoalCategory, GradeCriteria 어댑터 추가 (정적 데이터 위주)
- 36-6: EvalCycle, Goal 어댑터 (평가 사이클 핵심)
- 36-7: 나머지 모델들 (Feedback, FinalEvaluation, ProgressReport 등)
- 36-8: 모든 라우터를 Repository 호출로 전환
- 36-9: 기존 better-sqlite3 코드 완전 제거 + 정리
