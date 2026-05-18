# PROMPT 38: Organization Repository 어댑터

> 작성일: 2026-05-14
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 36-1 ~ 36-8, 37 모두 push 완료
> 패턴: 36-6 (GoalCategory), 36-8 (GradeCriteria) 패턴 확장
> 위험도: 중 (자기참조 관계 신규 도입)
> 예상 소요: 45분 이내

---

## 배경

Repository Pattern 적용 도메인이 3개(User, GoalCategory, GradeCriteria) 누적되었고, 패턴이 충분히 검증되었습니다. 이번에는 **자기참조 관계(self-relation)** 가 포함된 Organization을 다룹니다.

**36-6/36-8과의 차이점**:

| 항목 | 36-6/36-8 | 38 (Organization) |
|------|-----------|-------------------|
| 자기참조 관계 | 없음 | **parent_id** (조직 계층) |
| User 참조 | 없음 | **leader_id** (조직장) |
| JOIN 복잡도 | 단순 | 3-way JOIN |
| 라우터 수 | 4 | 5 (members 추가) |
| 삭제 방식 | masterOnly soft delete | 동일 |
| 감사 로그 | 없음 | **있음 (라우터에 유지)** |

---

## 작업 범위

### 신규 생성 (2개)
- `server/repositories/OrganizationRepository.js` (인터페이스)
- `server/adapters/prisma/PrismaOrganizationRepository.js` (Prisma 구현체)

### 수정 (2개)
- `server/config/repository-factory.js` — getOrganizationRepository 추가
- `server/index.js` — `/api/organizations` 라우터 5개 전환

---

## 설계 결정 사항

### 1. 감사 로그(`auditLog`)는 라우터에 유지
Repository는 순수 데이터 접근만 담당. 감사 로그는 비즈니스 로직이므로 라우터에 둠.

### 2. 멤버 조회 (`/:id/members`) 처리 방식
**UserRepository에 `findByOrgId(orgId)` 메서드를 신규 추가**하여 사용. Organization Repository가 users 테이블을 직접 알면 안 됨 (도메인 경계 침범).

→ **추가 작업**: UserRepository에 `findByOrgId` 메서드 신설 필요.

### 3. JOIN 처리
Prisma `include` 사용:
- `leader`: User 참조
- `parent`: Organization 자기참조

응답 형태는 기존 SQL 결과와 동일하게 만들기 위해 `leader_name`, `leader_title`, `parent_name` 필드를 평탄화(flatten)하여 반환.

### 4. is_active=0 (soft delete) 유지
하드 삭제하지 않음. 기존 동작 그대로.

---

## 작업 지시

### 1단계 — 인터페이스 파일 생성

`server/repositories/OrganizationRepository.js`:

```javascript
/**
 * OrganizationRepository — 조직 데이터 접근 인터페이스
 * organizations 테이블 추상화.
 * 자기참조 관계: parent_id (Organization), leader_id (User)
 * 실제 구현은 server/adapters/prisma/PrismaOrganizationRepository.js
 */
class OrganizationRepository {
  /**
   * 활성 조직 전체 목록 (leader, parent 정보 포함, sort_order 오름차순)
   * @returns {Promise<Array>} 평탄화된 조직 객체 배열
   *   각 항목: { ...org, leader_name, leader_title, parent_name }
   */
  async findAllActiveWithRelations() {
    throw new Error('OrganizationRepository.findAllActiveWithRelations is not implemented');
  }

  /**
   * 새 조직 추가
   * @param {Object} data { name, leader_id, parent_id, description, sort_order }
   * @returns {Promise<number>} 생성된 조직 ID
   */
  async create(data) {
    throw new Error('OrganizationRepository.create is not implemented');
  }

  /**
   * 조직 수정 (전체 필드)
   * @param {number} id - 조직 ID
   * @param {Object} data - 수정할 필드
   */
  async update(id, data) {
    throw new Error('OrganizationRepository.update is not implemented');
  }

  /**
   * 조직 비활성화 (soft delete)
   * @param {number} id - 조직 ID
   * @returns {Promise<Object>} { id, name } - 감사 로그용
   */
  async deactivate(id) {
    throw new Error('OrganizationRepository.deactivate is not implemented');
  }

  /**
   * 조직명 조회 (감사 로그용)
   * @param {number} id - 조직 ID
   * @returns {Promise<Object|null>} { name } 또는 null
   */
  async findNameById(id) {
    throw new Error('OrganizationRepository.findNameById is not implemented');
  }
}

module.exports = OrganizationRepository;
```

---

### 2단계 — Prisma 구현체 파일 생성

`server/adapters/prisma/PrismaOrganizationRepository.js`:

```javascript
const OrganizationRepository = require('../../repositories/OrganizationRepository');

/**
 * Prisma 기반 OrganizationRepository 구현체
 * 자기참조 관계(parent)와 User 관계(leader)를 include로 처리.
 */
class PrismaOrganizationRepository extends OrganizationRepository {
  constructor(prismaClient) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaOrganizationRepository requires a prismaClient instance');
    }
    this.prisma = prismaClient;
  }

  /**
   * Prisma 객체를 기존 SQL 결과와 동일한 평탄화 형태로 변환
   * @param {Object} org - Prisma 결과 객체 (include leader, parent 포함)
   * @returns {Object} { ...org, leader_name, leader_title, parent_name }
   */
  _flatten(org) {
    if (!org) return null;
    const { leader, parent, ...rest } = org;
    return {
      ...rest,
      leader_name: leader?.name || null,
      leader_title: leader?.title || null,
      parent_name: parent?.name || null
    };
  }

  async findAllActiveWithRelations() {
    const orgs = await this.prisma.organization.findMany({
      where: { is_active: 1 },
      include: {
        leader: { select: { name: true, title: true } },
        parent: { select: { name: true } }
      },
      orderBy: [
        { sort_order: 'asc' },
        { id: 'asc' }
      ]
    });
    return orgs.map(o => this._flatten(o));
  }

  async create(data) {
    const created = await this.prisma.organization.create({
      data: {
        name: data.name,
        leader_id: data.leader_id || null,
        parent_id: data.parent_id || null,
        description: data.description || '',
        sort_order: data.sort_order || 0
      }
    });
    return created.id;
  }

  async update(id, data) {
    await this.prisma.organization.update({
      where: { id: Number(id) },
      data: {
        name: data.name,
        leader_id: data.leader_id || null,
        parent_id: data.parent_id || null,
        description: data.description || '',
        sort_order: data.sort_order || 0
      }
    });
  }

  async deactivate(id) {
    const org = await this.prisma.organization.findUnique({
      where: { id: Number(id) },
      select: { id: true, name: true }
    });
    await this.prisma.organization.update({
      where: { id: Number(id) },
      data: { is_active: 0 }
    });
    return org;
  }

  async findNameById(id) {
    return await this.prisma.organization.findUnique({
      where: { id: Number(id) },
      select: { name: true }
    });
  }
}

module.exports = PrismaOrganizationRepository;
```

**주의 사항**:
- Prisma 모델명이 `organization`인지 `Organization`인지는 기존 `schema.prisma` 와 일치시켜야 함. (기존 36-6/36-8에서 `goalCategory`, `grade_criteria` 어떤 케이스를 썼는지 확인 후 통일)
- 필드명도 schema.prisma에 맞춰야 함. snake_case로 매핑되어 있을 가능성 높음. 36-8 PrismaGradeCriteriaRepository 패턴을 그대로 따를 것.
- `_flatten()` 메서드로 JOIN 결과를 기존 SQL 응답 형태와 동일하게 맞춤 (클라이언트 호환성 유지).

---

### 3단계 — UserRepository에 `findByOrgId` 메서드 추가

조직 멤버 조회는 User 도메인이므로 UserRepository를 확장.

#### 3-1. `server/repositories/UserRepository.js` 에 메서드 시그니처 추가

```javascript
/**
 * 특정 조직의 활성 멤버 목록 조회
 * @param {number} orgId - 조직 ID
 * @returns {Promise<Array>} 멤버 객체 배열 { id, name, title, grade, dept, role }
 */
async findByOrgId(orgId) {
  throw new Error('UserRepository.findByOrgId is not implemented');
}
```

(기존 UserRepository 인터페이스에 메서드만 추가, 다른 메서드는 그대로)

#### 3-2. `server/adapters/prisma/PrismaUserRepository.js` 에 구현 추가

```javascript
async findByOrgId(orgId) {
  return await this.prisma.user.findMany({
    where: {
      org_id: Number(orgId),
      is_active: 1
    },
    select: {
      id: true,
      name: true,
      title: true,
      grade: true,
      dept: true,
      role: true
    }
  });
}
```

(기존 PrismaUserRepository 클래스 내부에 메서드 추가)

---

### 4단계 — 팩토리 갱신

`server/config/repository-factory.js` 에 36-8과 같은 패턴으로 추가:

#### 4-1. 상단 require 영역
```javascript
const OrganizationRepository = require('../repositories/OrganizationRepository');
const PrismaOrganizationRepository = require('../adapters/prisma/PrismaOrganizationRepository');
```

#### 4-2. 팩토리 함수 추가
```javascript
function getOrganizationRepository() {
  // 36-8 getGradeCriteriaRepository 패턴 그대로
  return new PrismaOrganizationRepository(getSharedPrismaClient());
}
```

#### 4-3. exports 추가
```javascript
getOrganizationRepository,
```

(GradeCriteria 패턴 그대로 따라하면 됨)

---

### 5단계 — `server/index.js` 라우터 5개 전환

1768줄 근처의 `/api/organizations` 라우터 5개를 모두 Repository 호출로 전환.

#### 5-1. 상단 import (UserRepository 이미 import되어 있으면 그대로, 없으면 추가)

```javascript
const {
  getUserRepository,
  getGoalCategoryRepository,
  getGradeCriteriaRepository,
  getOrganizationRepository,  // ← 추가
} = require('./config/repository-factory');

const userRepo = getUserRepository();
const goalCategoryRepo = getGoalCategoryRepository();
const gradeCriteriaRepo = getGradeCriteriaRepository();
const organizationRepo = getOrganizationRepository();  // ← 추가
```

#### 5-2. GET /api/organizations (1768줄 근처)

**변경 후**:
```javascript
app.get('/api/organizations', auth, async (req, res) => {
  try {
    const orgs = await organizationRepo.findAllActiveWithRelations();
    res.json(orgs);
  } catch(err) {
    console.error('[GET /api/organizations]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 5-3. POST /api/organizations

**변경 후**:
```javascript
app.post('/api/organizations', auth, adminOnly, async (req, res) => {
  try {
    const { name, leader_id, parent_id, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: '조직명은 필수입니다.' });
    const newId = await organizationRepo.create({
      name, leader_id, parent_id, description, sort_order
    });
    auditLog(req.user.sub, 'ORG_CREATED', newId, name, `조직 생성: ${name}`, req.ip);
    res.json({ id: newId });
  } catch(err) {
    console.error('[POST /api/organizations]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 5-4. PUT /api/organizations/:id

**변경 후**:
```javascript
app.put('/api/organizations/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, leader_id, parent_id, description, sort_order } = req.body;
    await organizationRepo.update(req.params.id, {
      name, leader_id, parent_id, description, sort_order
    });
    auditLog(req.user.sub, 'ORG_UPDATED', req.params.id, name, `조직 수정: ${name}`, req.ip);
    res.json({ success: true });
  } catch(err) {
    console.error('[PUT /api/organizations/:id]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 5-5. DELETE /api/organizations/:id (masterOnly 유지)

**변경 후**:
```javascript
app.delete('/api/organizations/:id', auth, masterOnly, async (req, res) => {
  try {
    const org = await organizationRepo.deactivate(req.params.id);
    auditLog(req.user.sub, 'ORG_DELETED', req.params.id, org?.name, '조직 비활성화', req.ip);
    res.json({ success: true });
  } catch(err) {
    console.error('[DELETE /api/organizations/:id]', err);
    res.status(500).json({ error: err.message });
  }
});
```

#### 5-6. GET /api/organizations/:id/members (UserRepository 사용)

**변경 후**:
```javascript
app.get('/api/organizations/:id/members', auth, async (req, res) => {
  try {
    const members = await userRepo.findByOrgId(req.params.id);
    res.json(members);
  } catch(err) {
    console.error('[GET /api/organizations/:id/members]', err);
    res.status(500).json({ error: err.message });
  }
});
```

---

## 한글 에러 메시지 처리

`server/index.js`의 한글 메시지가 인코딩 깨져있을 수 있음 (36-8 GradeCriteria 때와 동일 상황). 정상 한글로 작성:

- `조직명은 필수입니다.`
- `조직 생성: ${name}`
- `조직 수정: ${name}`
- `조직 비활성화`
- `조직 변경: ${org?.name||'미지정'}`

---

## 검증 절차

### 1. 서버 정상 기동
```powershell
node server\index.js
```
`Server listening on port 3000` 출력 확인.

### 2. 관리자 페이지 접속
- `ceo@synapsoft.com` / `admin1234` 로그인
- 관리자 → **조직 관리** 탭

### 3. CRUD 5가지 모두 검증

| 동작 | 검증 항목 |
|------|-----------|
| GET (목록) | 기존 조직 목록 정상 표시, leader 이름과 parent 이름이 함께 나타남 |
| POST (추가) | "테스트조직" 추가 시 정상 생성, 감사 로그 기록 확인 |
| PUT (수정) | 추가한 항목의 leader, parent 수정 시 정상 반영 |
| DELETE (삭제) | 추가한 항목 삭제 시 목록에서 사라짐 (실제로는 is_active=0) |
| GET /:id/members | 조직 클릭 시 멤버 목록 정상 표시 |

### 4. F12 Network 탭 확인

각 동작 시 API 응답 200 OK, 응답 JSON 구조가 기존과 동일한지.

특히 GET 응답에 다음 필드가 모두 있는지:
- `leader_name`
- `leader_title`
- `parent_name`

### 5. 감사 로그 확인

관리자 → 감사 로그 탭:
- `ORG_CREATED`, `ORG_UPDATED`, `ORG_DELETED` 액션이 정상 기록되어 있는지

### 6. Prisma Studio로 DB 확인

```powershell
npx prisma studio
```
- `organizations` 테이블에서 신규 추가한 조직 확인
- 삭제한 조직의 `is_active=0` 상태 확인

### 7. 자기참조 무결성 검증

- A 조직을 B 조직의 parent로 설정 → 정상 표시되는지
- 사용자가 leader_id로 설정된 조직 → 사용자 이름이 정상 표시되는지

---

## 완료 후 처리

### 1. ClaudeHRM.md 갱신

"최근 개발 이력" 표 상단에 한 줄 추가:
```
| 2026-05-14 | PROMPT 38: Organization Repository 어댑터 + 라우터 5개 전환 (자기참조 관계 도입) | Claude Code |
```

"파일 구조" 영역에 신규 파일 2개 추가:
```
server/repositories/OrganizationRepository.js
server/adapters/prisma/PrismaOrganizationRepository.js
```

### 2. 커밋 + 푸시

```powershell
git add server/repositories/OrganizationRepository.js
git add server/adapters/prisma/PrismaOrganizationRepository.js
git add server/repositories/UserRepository.js
git add server/adapters/prisma/PrismaUserRepository.js
git add server/config/repository-factory.js
git add server/index.js
git add ClaudeHRM.md
git commit -m "feat(repository): Organization Repository Pattern 적용 (PROMPT 38)"
git push
```

---

## 작업 시 주의사항

- **Prisma 모델명 표기**: 기존 36-6/36-8에서 사용한 케이스(snake_case vs camelCase)를 정확히 따라야 함. schema.prisma 확인 필수
- **자기참조 관계명**: schema.prisma에 `parent`, `children` 등 관계명이 어떻게 정의되어 있는지 확인 후 include
- **leader 관계명**: User와의 관계가 어떻게 정의되어 있는지 schema.prisma 확인
- **감사 로그 위치**: 라우터에 유지. Repository로 옮기지 말 것
- **응답 형식 호환성**: GET 응답이 기존 SQL 결과와 동일한 평탄화 형태여야 함 (`leader_name`, `leader_title`, `parent_name`). 클라이언트가 이 필드명에 의존
- **UserRepository 확장**: `findByOrgId` 메서드 추가는 인터페이스와 구현체 양쪽 모두 빠뜨리지 말 것

---

## 다음 작업 예고 (39)

Organization 완료 후 본격 비즈니스 객체로:
- **EvalCycle**: 평가 사이클, 암호화 필드 1개, 다수 라우터 (`/api/evals/*`)
- **Goal**: 목표, 암호화 필드 2개, 카테고리/사이클 관계
- 또는 다른 발견 이슈 정리
