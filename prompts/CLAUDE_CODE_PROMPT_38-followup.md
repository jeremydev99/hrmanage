# PROMPT 38-followup: Prisma explicit relation 추가 + $queryRaw → include 전환

> 작성일: 2026-05-15
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 38 완료 (ce8a92c, c1a324a)
> 위험도: 낮음 (스키마 메타정보만 추가, DB 변경 없음)
> 예상 소요: 30~45분

---

## 배경

PROMPT 38 작업 시 schema.prisma에 Organization 모델의 explicit relation이 정의되지 않아 Prisma `include`를 사용할 수 없었고, **`$queryRaw`로 raw SQL JOIN**을 사용하여 우회했습니다.

이번 작업은 그 우회를 정리하고 **Prisma ORM의 표준 방식**으로 전환합니다.

---

## 작업의 의미

### 왜 중요한가
- Repository Pattern의 목적: DB 종류 추상화 (SQLite → PostgreSQL 전환 시 코드 변경 최소화)
- `$queryRaw`는 raw SQL이라 DB 방언 차이에 노출됨
- `include`는 Prisma ORM이 DB별 SQL을 자동 생성 → 진정한 DB 독립성 확보

### 안전성
- **DB 스키마 변경 없음** (`@relation`은 Prisma 메타정보일 뿐)
- **마이그레이션 불필요**
- **데이터 손실 가능성 0**
- `npx prisma generate`만 다시 실행

---

## 작업 범위

### 수정 파일 3개
- `prisma/schema.prisma` — Organization, User 모델에 relation 추가
- `server/adapters/prisma/PrismaOrganizationRepository.js` — `$queryRaw` → `include` 전환
- `ClaudeHRM.md` — 개발 이력 갱신

### 추가 명령
- `npx prisma generate` — Prisma Client 재생성

---

## 작업 지시

### 1단계 — schema.prisma의 Organization 모델 수정

`prisma/schema.prisma` 파일에서 **30~41줄** Organization 모델을 다음과 같이 변경:

**기존 (38줄 근처)**:
```prisma
model Organization {
  id          Int     @id @default(autoincrement())
  name        String
  leaderId    Int?    @map("leader_id")
  parentId    Int?    @map("parent_id")
  description String?
  sortOrder   Int?    @default(0) @map("sort_order")
  isActive    Int?    @default(1) @map("is_active")
  created_at  String?

  @@map("organizations")
}
```

**변경 후**:
```prisma
model Organization {
  id          Int     @id @default(autoincrement())
  name        String
  leaderId    Int?    @map("leader_id")
  parentId    Int?    @map("parent_id")
  description String?
  sortOrder   Int?    @default(0) @map("sort_order")
  isActive    Int?    @default(1) @map("is_active")
  created_at  String?

  // === explicit relations (38-followup 추가) ===
  // 조직장 (User 참조)
  leader      User?         @relation("OrgLeader", fields: [leaderId], references: [id])
  // 상위 조직 (자기참조)
  parent      Organization? @relation("OrgHierarchy", fields: [parentId], references: [id])
  // 하위 조직들 (자기참조 역방향)
  children    Organization[] @relation("OrgHierarchy")
  // 이 조직 소속 사용자들 (User.organization의 역방향)
  members     User[]        @relation("OrgMembers")

  @@map("organizations")
}
```

**주의 사항**:
- 관계명("OrgLeader", "OrgHierarchy", "OrgMembers")은 Prisma가 다중 relation을 구분하기 위해 필요
- `parent`/`children`은 같은 모델끼리의 자기참조이므로 동일한 관계명("OrgHierarchy") 사용
- `members`는 User의 orgId와 연결되는 역방향 관계

---

### 2단계 — schema.prisma의 User 모델에 역방향 관계 추가

`prisma/schema.prisma`의 **10~28줄** User 모델 끝부분에 relation 추가:

**기존 (28줄 근처)**:
```prisma
model User {
  id            Int     @id @default(autoincrement())
  name          String
  email         String  @unique(map: "sqlite_autoindex_users_1")
  passwordHash  String  @map("password_hash")
  role          String? @default("user")
  dept          String?
  title         String?
  managerId     Int?    @map("manager_id")
  isActive      Int?    @default(1) @map("is_active")
  created_at    String?
  accountStatus String? @default("approved") @map("account_status")
  signupNote    String? @map("signup_note")
  grade         String? @default("")
  evalMode      String? @default("MBO") @map("eval_mode")
  orgId         Int?    @map("org_id")

  @@map("users")
}
```

**변경 후**:
```prisma
model User {
  id            Int     @id @default(autoincrement())
  name          String
  email         String  @unique(map: "sqlite_autoindex_users_1")
  passwordHash  String  @map("password_hash")
  role          String? @default("user")
  dept          String?
  title         String?
  managerId     Int?    @map("manager_id")
  isActive      Int?    @default(1) @map("is_active")
  created_at    String?
  accountStatus String? @default("approved") @map("account_status")
  signupNote    String? @map("signup_note")
  grade         String? @default("")
  evalMode      String? @default("MBO") @map("eval_mode")
  orgId         Int?    @map("org_id")

  // === explicit relations (38-followup 추가) ===
  // 소속 조직
  organization     Organization?  @relation("OrgMembers", fields: [orgId], references: [id])
  // 내가 조직장인 조직들
  ledOrganizations Organization[] @relation("OrgLeader")

  @@map("users")
}
```

**주의 사항**:
- `organization`은 User의 orgId로 Organization을 가리킴
- `ledOrganizations`는 User가 leader인 Organization들의 역방향 (관계명 일치 필요)
- 관계명("OrgMembers", "OrgLeader")이 Organization 모델 쪽과 정확히 일치해야 함

---

### 3단계 — Prisma Client 재생성

schema.prisma 수정 후 반드시 실행:

```powershell
npx prisma generate
```

성공 시 다음과 같은 출력 표시됨:
```
✔ Generated Prisma Client (v...) to ./generated/prisma in ...
```

**오류 발생 시**:
- 관계명 불일치 — Organization과 User의 관계명이 정확히 일치하는지 재확인
- `fields:` 와 `references:` 의 컬럼명 확인 (camelCase 사용)

---

### 4단계 — PrismaOrganizationRepository.js 전환

`server/adapters/prisma/PrismaOrganizationRepository.js` 파일의 `findAllActiveWithRelations()` 메서드를 `$queryRaw` 에서 `include` 방식으로 교체.

**기존 (`$queryRaw` 사용)**:
```javascript
async findAllActiveWithRelations() {
  const result = await this.prisma.$queryRaw`
    SELECT o.*, u.name as leader_name, u.title as leader_title, p.name as parent_name
    FROM organizations o
    LEFT JOIN users u ON o.leader_id = u.id
    LEFT JOIN organizations p ON o.parent_id = p.id
    WHERE o.is_active = 1
    ORDER BY o.sort_order, o.id
  `;
  return result;
}
```

**변경 후 (Prisma `include`)**:
```javascript
/**
 * Prisma 응답을 기존 SQL 결과 형태로 평탄화
 * 클라이언트 호환성 유지를 위해 leader_name, leader_title, parent_name 필드를 평탄화
 */
_flatten(org) {
  if (!org) return null;
  const { leader, parent, leaderId, parentId, sortOrder, isActive, ...rest } = org;
  return {
    ...rest,
    // 클라이언트가 기대하는 snake_case 필드명 유지
    leader_id: leaderId,
    parent_id: parentId,
    sort_order: sortOrder,
    is_active: isActive,
    leader_name: leader?.name || null,
    leader_title: leader?.title || null,
    parent_name: parent?.name || null
  };
}

async findAllActiveWithRelations() {
  const orgs = await this.prisma.organization.findMany({
    where: { isActive: 1 },
    include: {
      leader: { select: { name: true, title: true } },
      parent: { select: { name: true } }
    },
    orderBy: [
      { sortOrder: 'asc' },
      { id: 'asc' }
    ]
  });
  return orgs.map(o => this._flatten(o));
}
```

**주의 사항**:
- `where: { isActive: 1 }` — Prisma는 schema에 정의된 camelCase 필드명 사용 (`isActive`, `sortOrder`)
- `_flatten()` 메서드로 응답 형태를 기존 SQL 결과와 동일하게 변환 (snake_case 필드명, `leader_name` 등 추가)
- 기존 클라이언트(`admin.js`)가 이 응답 형식에 의존하므로 평탄화 필수

---

### 5단계 — 다른 메서드들의 일관성 확인

`PrismaOrganizationRepository.js`의 나머지 메서드(`create`, `update`, `deactivate`, `findNameById`)는 이미 Prisma ORM 방식을 쓰고 있을 것이므로 그대로 유지. 단, `_flatten()` 메서드가 새로 추가됐으니 import나 충돌 없는지 점검.

---

## 검증 절차

### 1. Prisma 클라이언트 재생성 성공 확인
```powershell
npx prisma generate
```
오류 없이 완료되면 다음으로 진행.

### 2. 서버 정상 기동
```powershell
node server\index.js
```
`Server listening on port 3000` 출력 확인.

### 3. 관리자 페이지에서 조직 관리 동작 확인

`ceo@synapsoft.com` / `admin1234` 로그인 → 관리자 → 조직 관리.

| 동작 | 기대 결과 |
|------|-----------|
| 조직 목록 표시 | 기존과 동일하게 leader 이름과 parent 이름이 보임 |
| 새 조직 추가 | 정상 생성, 감사 로그 기록 |
| 조직 수정 (leader 변경) | 정상 반영 |
| 조직 삭제 | 목록에서 사라짐 (is_active=0) |

### 4. F12 Network 탭에서 응답 구조 확인

`GET /api/organizations` 응답 JSON 확인:
- `leader_name`, `leader_title`, `parent_name` 필드 존재
- `leader_id`, `parent_id`, `sort_order`, `is_active` snake_case 필드 존재
- 38 작업 후 응답 형식과 100% 동일해야 함

### 5. 클라이언트 사이드 에러 없음 확인

F12 Console 탭에 빨간 에러 메시지 없는지.

### 6. 자체 검증 — Repository 메서드 직접 테스트 (선택)

Claude Code가 다음과 같은 검증 코드를 실행해서 결과 보고:

```javascript
const repo = getOrganizationRepository();
const orgs = await repo.findAllActiveWithRelations();
console.log('조직 수:', orgs.length);
console.log('첫 번째 조직:', orgs[0]);
console.log('leader_name 필드 존재:', 'leader_name' in orgs[0]);
console.log('parent_name 필드 존재:', 'parent_name' in orgs[0]);
```

---

## 완료 후 처리

### 1. ClaudeHRM.md 갱신

"최근 개발 이력" 표 상단에 한 줄 추가:
```
| 2026-05-15 | PROMPT 38-followup: Prisma explicit relation 추가 + $queryRaw → include 전환 | Claude Code |
```

"설계 원칙" 또는 적절한 위치에 메모 추가:
```
- Organization-User, Organization-Organization(self) 관계는 explicit @relation 정의됨
- 관계명: OrgLeader, OrgHierarchy, OrgMembers
```

### 2. 커밋 + 푸시

```powershell
git add prisma/schema.prisma
git add server/adapters/prisma/PrismaOrganizationRepository.js
git add ClaudeHRM.md
git commit -m "refactor(repository): Organization \$queryRaw → Prisma include 전환 (PROMPT 38-followup)"
git push
```

---

## 작업 시 주의사항

- **DB는 건드리지 않음** — 마이그레이션 없음, `prisma migrate` 실행 금지
- **`npx prisma generate` 필수** — schema.prisma 수정 후 반드시 실행
- **관계명 정확히 일치** — Organization과 User 양쪽의 관계명이 1바이트라도 다르면 작동 안 함
- **응답 형식 100% 호환** — `_flatten()` 메서드로 기존 SQL 응답 형태 유지
- **외래키 Number() 변환** — 38 후속에서 추가한 Number() 변환 로직은 그대로 유지 (제거하지 말 것)

---

## 다음 작업 예고 (40)

38-followup 완료 후 본격 비즈니스 객체 어댑터로 진행:
- **40-A**: EvalCycle Repository 어댑터 (`/api/evals/*`, 암호화 필드 1개)
- **40-B**: Goal Repository 어댑터 (`/api/evals/:id/goals`, 암호화 필드 2개)

또는 발견된 다른 이슈 정리.
