# CLAUDE_CODE_PROMPT_46 — INFRA-2A-1: PostgreSQL 호환 schema.prisma 신규 작성

## 작업 개요

PostgreSQL 16 호환 schema 파일 `prisma/schema.postgresql.prisma`를 **신규 작성**한다.
**기존 `prisma/schema.prisma`(SQLite용)는 절대 수정하지 않는다.** 이번 작업은 설계만 진행, 코드 변경 0.

## 작업 위험도: 하 (신규 파일 1개 추가만, 기존 코드 영향 없음)

## 사전 확인

작업 전 다음 파일 확인:
- `prisma/schema.prisma` — 기존 SQLite용. **읽기 전용, 절대 수정 금지**
- `CLAUDE.md`, `ClaudeHRM.md` — 컨텍스트 파악

## 작업 절차

### 1. 신규 파일 생성

**파일 경로**: `prisma/schema.postgresql.prisma`

**파일 헤더 주석**:
```prisma
// ㈜사이냅소프트 인사평가 시스템 — PostgreSQL 16 호환 schema
//
// 작성: 2026-05-20 (PROMPT 46, INFRA-2A-1)
// 기준: prisma/schema.prisma (SQLite 버전, 2026-05-14 prisma db pull)
//
// 변환 원칙:
// 1. 모든 시각 컬럼(*_at, created_at, updated_at, submitted_at, approved_at,
//    *_done_at, locked_at)은 String? + @default("datetime('now')")
//    → DateTime? @default(now()) 또는 DateTime? @updatedAt
// 2. Boolean 의미 정수(is_active, locked, *_done) 필드는 일단 Int 유지.
//    INFRA-2B에서 CHECK 제약(0 또는 1만 허용)으로 정합성 100% 보장 예정
// 3. SQLite 자동 인덱스 명명(sqlite_autoindex_*) 제거.
//    PG 명명 규칙으로 변경 또는 map 제거 (Prisma 기본 명명 사용)
// 4. 외래키 관계 @relation 명시 추가 (이전에는 raw Int 컬럼만 존재):
//    - users.manager_id → User (ON DELETE SET NULL)
//    - users.org_id → Organization (ON DELETE SET NULL)
//    - organizations.parent_id → Organization (ON DELETE SET NULL, 자기참조)
//    - organizations.leader_id → User (ON DELETE SET NULL)
//    - eval_cycles.user_id → User (ON DELETE CASCADE)
//    - goals.eval_id → EvalCycle (ON DELETE CASCADE)
//    - goals.category_id → GoalCategory (ON DELETE RESTRICT)
//    - goal_approvals.eval_id → EvalCycle (ON DELETE CASCADE)
//    - goal_approvals.approver_id → User (ON DELETE RESTRICT)
//    - feedbacks.eval_id → EvalCycle (ON DELETE CASCADE)
//    - feedbacks.author_id → User (ON DELETE RESTRICT)
//    - feedback_items.feedback_id → Feedback (ON DELETE CASCADE)
//    - feedback_items.goal_id → Goal (ON DELETE CASCADE)
//    - final_evaluations.eval_id → EvalCycle (ON DELETE CASCADE, UNIQUE 유지)
//    - final_evaluations.mgr_approver_id → User (ON DELETE SET NULL)
//    - final_evaluations.second_mgr_id → User (ON DELETE SET NULL)
//    - final_eval_scores.final_id → FinalEvaluation (ON DELETE CASCADE)
//    - final_eval_scores.goal_id → Goal (ON DELETE CASCADE)
//    - progress_reports.eval_id → EvalCycle (ON DELETE CASCADE)
//    - progress_reports.author_id → User (ON DELETE RESTRICT)
//    - report_files.report_id → ProgressReport (ON DELETE CASCADE)
//    - report_files.feedback_id → Feedback (ON DELETE CASCADE)
//    - report_files.final_eval_id → FinalEvaluation (ON DELETE CASCADE)
//    - eval_period_modes.period_id → EvalPeriod (ON DELETE CASCADE)
//    - eval_period_modes.manager_id → User (ON DELETE CASCADE)
//    - okr_objectives.cycle_id → OkrCycle (ON DELETE CASCADE)
//    - okr_key_results.objective_id → OkrObjective (ON DELETE CASCADE)
//    - audit_logs.user_id → User (ON DELETE SET NULL)
//    - audit_logs.target_id: 외래키 미설정 (다양한 타겟 가리킴)
// 5. AppSetting의 @@ignore 제거. key를 String @id로 정의
// 6. report_files.file_data는 매우 큰 BLOB 가능 → PG는 bytea 또는 text.
//    현재 base64 문자열 저장이므로 String 유지 (INFRA-2C에서 Object Storage 이관 예정)
// 7. created_at 컬럼은 @map 명시 일관성 유지
//    (기존 schema.prisma는 일부만 @map, 일부는 컬럼명 그대로. 모두 @map으로 통일)
//
// 이 파일은 INFRA-2A-4 (로컬 PostgreSQL 마이그레이션) 시점부터 활성화 예정.
// 현재는 설계 검토용 — 실제 prisma generate에는 schema.prisma만 사용됨.

generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma-pg"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL_PG")
}
```

**모델 정의** — 다음 원칙을 반드시 따른다:

#### 공통 규칙
- `created_at`, `updated_at`은 `DateTime? @default(now()) @map("created_at")` 형태
- `updated_at` 중 자동 갱신이 필요한 경우 `@updatedAt` 사용 가능 (단, 기존 동작과 비교하여 결정 — 현재 server/index.js가 명시적으로 `updated_at=datetime('now')` 호출 중이므로 **`@updatedAt` 사용하지 않음**, `@default(now())`만 사용)
- `*_at` 컬럼 중 `@map` 없이 그냥 컬럼명과 같은 경우(`created_at`, `updated_at`, `submitted_at`, `approved_at`, `self_done_at` 등)도 일관성 위해 `@map`을 굳이 추가하지 않아도 됨 (camelCase 변환 불필요). 단 명시적으로 컬럼명 일치 보장 필요시 `@map` 추가
- `Int? @default(0)` 또는 `@default(1)` 형태의 boolean 의미 필드는 **그대로 유지** (CHECK 제약은 INFRA-2B에서)
- 모든 외래키는 `@relation` 명시 + 관계 양방향 정의
- 자기참조 관계(users.manager_id → users, organizations.parent_id → organizations)는 `name` 속성 명시 필수

#### 모델별 작성 예시 (User 모델만)

```prisma
model User {
  id            Int       @id @default(autoincrement())
  name          String
  email         String    @unique
  passwordHash  String    @map("password_hash")
  role          String?   @default("user")
  dept          String?
  title         String?
  managerId     Int?      @map("manager_id")
  isActive      Int?      @default(1) @map("is_active")
  createdAt     DateTime? @default(now()) @map("created_at")
  accountStatus String?   @default("approved") @map("account_status")
  signupNote    String?   @map("signup_note")
  grade         String?   @default("")
  evalMode      String?   @default("MBO") @map("eval_mode")
  orgId         Int?      @map("org_id")

  // 자기참조: 매니저 관계
  manager   User?  @relation("UserManager", fields: [managerId], references: [id], onDelete: SetNull)
  reports   User[] @relation("UserManager")

  // 조직 관계
  org       Organization? @relation("UserOrg", fields: [orgId], references: [id], onDelete: SetNull)

  // 역참조 관계들
  ledOrgs           Organization[]     @relation("OrgLeader")
  evalCycles        EvalCycle[]
  createdCategories GoalCategory[]
  goalApprovals     GoalApproval[]
  feedbacksAuthored Feedback[]
  finalEvalsApproved FinalEvaluation[] @relation("MgrApprover")
  finalEvalsSecond   FinalEvaluation[] @relation("SecondMgr")
  reportsAuthored   ProgressReport[]
  evalPeriodModes   EvalPeriodMode[]
  auditLogs         AuditLog[]

  @@map("users")
}
```

#### 작성 대상 모델 (20개, 알파벳 순)

1. AppSetting (`@@ignore` 제거, key: String @id)
2. AuditLog
3. EvalCycle
4. EvalPeriod
5. EvalPeriodMode (`@@unique([periodId, managerId])`로 변경, sqlite_autoindex_* 제거)
6. Feedback
7. FeedbackItem
8. FinalEvalScore
9. FinalEvaluation (`evalId @unique` 유지, sqlite_autoindex_* 제거)
10. Goal
11. GoalApproval
12. GoalCategory
13. GradeCriteria
14. OkrCycle
15. OkrKeyResult
16. OkrObjective
17. Organization (자기참조 `OrganizationParent` 관계 필수)
18. ProgressReport
19. ReportFile
20. User

각 모델은 위 User 예시처럼:
- 필드 타입을 DateTime/Int/String 등으로 정확히 매핑
- @relation 양방향 명시
- @map 일관 적용
- SQLite-specific 인덱스 명명 제거

### 2. 검증

작성 완료 후:
```bash
# 문법 검증 (실제 DB 연결은 안 함, 파일 파싱만)
npx prisma format --schema=prisma/schema.postgresql.prisma
```

오류 없이 통과해야 한다. **`prisma generate`, `prisma db push`는 절대 실행하지 말 것.** 이번 작업은 설계만.

### 3. 문서 업데이트

`ClaudeHRM.md` 업데이트:
- "최근 개발 이력" 섹션 맨 위에 1줄 추가:
  ```
  | 2026-05-20 | PostgreSQL 호환 schema 설계 (schema.postgresql.prisma 신규, 20개 모델, FK 관계 명시, INFRA-2A-1) (PROMPT 46) | Claude Code |
  ```
- "최근 개발 이력" 섹션이 너무 길면 가장 오래된 1줄 삭제하여 분량 유지
- 운영 진입 준비 체크리스트 섹션이 없으면 추가:
  ```
  ## 운영 진입 준비 체크리스트 (INFRA-2 시리즈)

  ### INFRA-2A: PostgreSQL 전환
  - [x] INFRA-2A-1: PostgreSQL 호환 schema 설계 (2026-05-20)
  - [ ] INFRA-2A-2: DateTime/Boolean 타입 전환 영향 분석
  - [ ] INFRA-2A-3: 어댑터 _flatten() DateTime → ISO string 변환 추가
  - [ ] INFRA-2A-4: 로컬 PostgreSQL 컨테이너 마이그레이션 + 기능 검증
  - [ ] INFRA-2A-5: SQLite → PostgreSQL 데이터 이관 스크립트

  ### INFRA-2B: 정합성 100% 적용
  - [ ] phase 일관성 CHECK 제약
  - [ ] score-done 일관성 트리거
  - [ ] 승인 순서 CHECK 제약
  - [ ] 승인 1인 1회 UNIQUE 제약
  - [ ] 외래키 ON DELETE 정책 명시 (INFRA-2A-1에서 schema에 반영, 마이그레이션은 INFRA-2A-4)
  - [ ] 암호화 검증 CHECK 제약
  - [ ] 타임스탬프 일관성 CHECK 제약
  - [ ] force-phase 백도어 master 제한 + 감사로그 강제

  ### INFRA-2C: Object Storage
  - [ ] report_files.file_data → NCloud Object Storage 이관

  ### INFRA-2D: NCloud 환경 셋업
  - [ ] 인스턴스 사이즈 결정
  - [ ] Cloud DB for PostgreSQL 플랜 결정
  - [ ] HTTPS 인증서 적용
  - [ ] 배포 자동화

  ### INFRA-3: 보안 강화
  - [x] .env 분리 (2026-05-13, PROMPT 34)
  - [ ] AES-256-CBC → AES-256-GCM
  - [ ] JWT 키 로테이션 정책

  ### INFRA-4: 법무·계약
  - [ ] 개인정보처리방침
  - [ ] 표준약관
  - [ ] DPA (데이터 처리 위탁 계약)
  - [ ] 국외이전 동의서
  ```

### 4. Git 커밋

```bash
git add prisma/schema.postgresql.prisma ClaudeHRM.md
git commit -m "PostgreSQL 호환 schema 설계 (schema.postgresql.prisma 신규, 20개 모델, FK 관계 명시, INFRA-2A-1) (PROMPT 46)"
```

**push는 사용자 수동.**

## 작업 완료 체크리스트

- [ ] `prisma/schema.postgresql.prisma` 신규 파일 생성 (20개 모델 전체)
- [ ] 모든 시각 컬럼이 `DateTime? @default(now())` 형태로 변환
- [ ] 모든 외래키에 `@relation` 양방향 명시
- [ ] 자기참조 관계(User.manager, Organization.parent) 처리
- [ ] SQLite-specific 인덱스 명명 제거
- [ ] AppSetting의 `@@ignore` 제거, `key String @id`
- [ ] `npx prisma format --schema=prisma/schema.postgresql.prisma` 통과
- [ ] `prisma/schema.prisma` 원본은 **변경되지 않음** (절대 수정 금지)
- [ ] ClaudeHRM.md 업데이트 (개발 이력 1줄 + 운영 진입 준비 체크리스트 섹션)
- [ ] git commit 완료

## 검증 시나리오 (작업 완료 후 사용자 측 확인용)

1. `npx prisma format --schema=prisma/schema.postgresql.prisma` 명령으로 문법 검증
2. `prisma/schema.prisma` 파일이 변경되지 않았는지 `git status` 확인
3. 어플리케이션 동작 확인 — **기존 SQLite 시스템 완전 동일하게 동작해야 함** (이번 작업은 코드 영향 0)
4. `docker-compose up` 후 로그인 + 평가 화면 진입 정상 확인

## 주의사항

- **prisma/schema.prisma는 절대 수정하지 않는다.** 이 작업은 신규 파일 1개 추가만.
- `npx prisma generate`나 `prisma db push`는 절대 실행하지 않는다. 이번은 설계만.
- 마이그레이션 파일도 생성하지 않는다.
- 향후 INFRA-2A-4에서 활용 예정.
