# 작업 36-1: Prisma 도입 — 설치 + 스키마 정의 + DB 연결 확인

> 작성일: 2026-05-14
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 35 (Git 자동 커밋 규칙 + UI 정리) 완료
> 목적: ORM 추상화 첫 단계 — Prisma 설치하고 schema.prisma 정의 후 SQLite 연결 검증
> 위험도: 중 (코드 변경은 거의 없음, 새 파일 추가 위주)

---

## 작업 전 확인사항

1. CLAUDE.md, ClaudeHRM.md 먼저 읽기
2. **현재 브랜치가 `feat/prisma-orm`인지 반드시 확인** (`git branch`)
3. 작업 전 `git status` 깨끗한 상태인지 확인
4. data/hrmanage.db 파일이 존재하는지 확인 (기존 데이터 보존 대상)

---

## 작업의 큰 그림

### 무엇을 하는가
- Prisma ORM을 프로젝트에 도입
- 17개 테이블 전체를 `schema.prisma` 파일에 정의
- DB 연결을 환경변수로 분리 (SQLite/PostgreSQL 등 선택 가능 구조)
- 기존 better-sqlite3 코드는 **건드리지 않음** (안전망 유지)

### 무엇을 하지 않는가
- ❌ server/index.js의 기존 SQL 쿼리는 **수정하지 않음** (다음 PROMPT)
- ❌ Repository Pattern 구현 (PROMPT 36-2)
- ❌ PostgreSQL 실제 사용 (PROMPT 39 이후)
- ❌ 데이터 마이그레이션 (PROMPT 40)

### 작업 결과
- `prisma/` 폴더 생성, `schema.prisma` 파일 작성
- Prisma Client 코드 생성 (`@prisma/client` 자동)
- 새 npm 스크립트 추가 (`db:generate`, `db:migrate`, `db:studio`)
- .env에 `DATABASE_URL` 추가
- 검증: `npx prisma db pull`로 기존 DB와 schema가 일치하는지 확인 가능

---

## 작업 1: Prisma 패키지 설치

```bash
cd C:\claudeprojects\hrmanage
npm install prisma --save-dev
npm install @prisma/client
```

설치 후 package.json의 dependencies에 `@prisma/client`, devDependencies에 `prisma`가 추가되었는지 확인.

---

## 작업 2: Prisma 초기화

```bash
npx prisma init --datasource-provider sqlite
```

이 명령은 다음을 자동 생성:
- `prisma/schema.prisma` 파일 (기본 템플릿)
- `.env`에 `DATABASE_URL=...` 한 줄 추가 (있으면 건너뜀)

⚠️ **주의**: .env에 기존 변수들(LLM_API_KEY 등)이 있으므로, prisma init이 .env를 덮어쓰지 않고 추가하는지 확인. 만약 덮어쓴다면 백업 후 복원.

---

## 작업 3: .env 파일 정리

작업 2 후 .env 파일 내용을 다음 형태로 정리:

```
# 사내 LLM 설정 (Synap)
LLM_API_BASE=https://chat.synap.co.kr/api/chat/completions
LLM_API_KEY=(기존 값 그대로 유지)
LLM_MODEL=SynapAssistant-MoE-30B

# 보안 키
JWT_SECRET=(기존 값 그대로 유지)
ENC_SECRET=(기존 값 그대로 유지)

# 서버 포트
PORT=3000

# ===== DB 연결 =====
# 개발 환경 (SQLite, 기본)
DATABASE_URL="file:../data/hrmanage.db"

# 운영 환경 (PostgreSQL, 추후 사용)
# DATABASE_URL="postgresql://user:password@localhost:5432/hrmanage?schema=public"
```

**중요**:
- 기존 변수들 절대 삭제 금지
- `DATABASE_URL`만 새로 추가 또는 prisma init이 만든 줄을 수정
- SQLite 경로는 `file:../data/hrmanage.db` (prisma 폴더 기준 상대 경로)

---

## 작업 4: schema.prisma 작성

`prisma/schema.prisma` 파일을 다음 내용으로 작성. 기존 ClaudeHRM.md의 DB 스키마를 그대로 반영하되, **나중에 PostgreSQL로 옮길 때 호환되도록** 작성.

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"        // 개발 환경 기본
  url      = env("DATABASE_URL")
}

// ===== 사용자/조직 =====

model User {
  id              Int       @id @default(autoincrement())
  name            String
  email           String    @unique
  passwordHash    String    @map("password_hash")
  role            String    @default("user")  // master | admin | user
  dept            String?
  grade           String?
  title           String?
  managerId       Int?      @map("manager_id")
  isActive        Int       @default(1) @map("is_active")
  accountStatus   String?   @default("approved") @map("account_status")
  signupNote      String?   @map("signup_note")
  orgId           Int?      @map("org_id")
  evalMode        String?   @map("eval_mode")
  
  @@map("users")
}

model Organization {
  id          Int     @id @default(autoincrement())
  name        String
  leaderId    Int?    @map("leader_id")
  parentId    Int?    @map("parent_id")
  description String?
  sortOrder   Int     @default(0) @map("sort_order")
  isActive    Int     @default(1) @map("is_active")
  
  @@map("organizations")
}

// ===== 평가 사이클 =====

model EvalCycle {
  id           Int     @id @default(autoincrement())
  userId       Int     @map("user_id")
  periodType   String? @map("period_type")
  periodLabel  String? @map("period_label")
  evalYear     Int?    @map("eval_year")
  phase        String  @default("draft")
  selfReason   String? @map("self_reason")  // 암호화 필드
  rejectReason String? @map("reject_reason")
  locked       Int     @default(0)
  
  @@map("eval_cycles")
}

model Goal {
  id         Int     @id @default(autoincrement())
  evalId     Int     @map("eval_id")
  categoryId Int?    @map("category_id")
  name       String  // 암호화 필드
  kpi        String? // 암호화 필드
  weight     Int     @default(0)
  sortOrder  Int     @default(0) @map("sort_order")
  status     String  @default("draft")
  
  @@map("goals")
}

model GoalCategory {
  id          Int     @id @default(autoincrement())
  name        String
  description String?
  weight      Int     @default(0)
  color       String?
  textColor   String? @map("text_color")
  sortOrder   Int     @default(0) @map("sort_order")
  isActive    Int     @default(1) @map("is_active")
  
  @@map("goal_categories")
}

// ===== 승인 =====

model GoalApproval {
  id         Int     @id @default(autoincrement())
  evalId     Int     @map("eval_id")
  approverId Int     @map("approver_id")
  level      Int     @default(1)
  action     String  // request | approve | reject
  note       String? // 암호화 필드
  
  @@map("goal_approvals")
}

model EvalApprovalHistory {
  id          Int     @id @default(autoincrement())
  evalId      Int     @map("eval_id")
  userId      Int     @map("user_id")
  periodLabel String? @map("period_label")
  evalYear    Int?    @map("eval_year")
  action      String
  reason      String?
  
  @@map("eval_approval_history")
}

// ===== 피드백 =====

model Feedback {
  id          Int     @id @default(autoincrement())
  evalId      Int     @map("eval_id")
  authorId    Int     @map("author_id")
  overallNote String? @map("overall_note")  // 암호화 필드
  
  @@map("feedbacks")
}

model FeedbackItem {
  id         Int     @id @default(autoincrement())
  feedbackId Int     @map("feedback_id")
  goalId     Int     @map("goal_id")
  score      Int?
  note       String? // 암호화 필드
  
  @@map("feedback_items")
}

// ===== 최종 평가 =====

model FinalEvaluation {
  id              Int     @id @default(autoincrement())
  evalId          Int     @map("eval_id")
  selfNote        String? @map("self_note")        // 암호화
  selfDone        Int     @default(0) @map("self_done")
  mgrNote         String? @map("mgr_note")         // 암호화
  mgrDone         Int     @default(0) @map("mgr_done")
  mgrApproverId   Int?    @map("mgr_approver_id")
  finalScore      Float?  @map("final_score")
  finalGrade      String? @map("final_grade")
  selectedGrade   String? @map("selected_grade")
  secondMgrDone   Int     @default(0) @map("second_mgr_done")
  secondMgrNote   String? @map("second_mgr_note")  // 암호화
  secondMgrId     Int?    @map("second_mgr_id")
  locked          Int     @default(0)
  
  @@map("final_evaluations")
}

model FinalEvalScore {
  id             Int     @id @default(autoincrement())
  finalId        Int     @map("final_id")
  goalId         Int     @map("goal_id")
  selfScore      Float?  @map("self_score")
  mgrScore       Float?  @map("mgr_score")
  secondMgrScore Float?  @map("second_mgr_score")
  
  @@map("final_eval_scores")
}

// ===== 중간 보고 / 파일 =====

model ProgressReport {
  id       Int    @id @default(autoincrement())
  evalId   Int    @map("eval_id")
  authorId Int    @map("author_id")
  content  String // 암호화 필드
  
  @@map("progress_reports")
}

model ReportFile {
  id          Int     @id @default(autoincrement())
  reportId    Int?    @map("report_id")
  feedbackId  Int?    @map("feedback_id")
  finalEvalId Int?    @map("final_eval_id")
  fileName    String  @map("file_name")
  fileData    Bytes   @map("file_data")
  
  @@map("report_files")
}

// ===== 설정 =====

model AppSetting {
  key       String  @id
  value     String
  updatedBy Int?    @map("updated_by")
  updatedAt String? @map("updated_at")
  
  @@map("app_settings")
}

model EvalPeriod {
  id          Int     @id @default(autoincrement())
  periodType  String? @map("period_type")
  periodLabel String? @map("period_label")
  evalYear    Int?    @map("eval_year")
  isActive    Int     @default(1) @map("is_active")
  evalMode    String? @map("eval_mode")
  locked      Int     @default(0)
  
  @@map("eval_periods")
}

model EvalPeriodMode {
  id         Int     @id @default(autoincrement())
  periodId   Int     @map("period_id")
  managerId  Int?    @map("manager_id")
  evalMode   String  @map("eval_mode")
  locked     Int     @default(0)
  
  @@unique([periodId, managerId])
  @@map("eval_period_modes")
}

// ===== 감사 / 등급 =====

model AuditLog {
  id         Int     @id @default(autoincrement())
  userId     Int?    @map("user_id")
  action     String
  targetId   Int?    @map("target_id")
  targetName String? @map("target_name")
  detail     String?
  ip         String?
  
  @@map("audit_logs")
}

model GradeCriteria {
  id          Int     @id @default(autoincrement())
  gradeCode   String  @map("grade_code")
  gradeName   String  @map("grade_name")
  description String?
  note        String?
  sortOrder   Int     @default(0) @map("sort_order")
  isActive    Int     @default(1) @map("is_active")
  
  @@map("grade_criteria")
}

// ===== OKR =====

model OkrCycle {
  id          Int     @id @default(autoincrement())
  userId      Int     @map("user_id")
  periodLabel String? @map("period_label")
  evalYear    Int?    @map("eval_year")
  phase       String  @default("draft")
  
  @@map("okr_cycles")
}

model OkrObjective {
  id          Int     @id @default(autoincrement())
  cycleId     Int     @map("cycle_id")
  title       String
  description String?
  sortOrder   Int     @default(0) @map("sort_order")
  
  @@map("okr_objectives")
}

model OkrKeyResult {
  id           Int     @id @default(autoincrement())
  objectiveId  Int     @map("objective_id")
  title        String
  targetValue  Float?  @map("target_value")
  currentValue Float?  @map("current_value")
  unit         String?
  weight       Int     @default(0)
  sortOrder    Int     @default(0) @map("sort_order")
  
  @@map("okr_key_results")
}
```

### 작성 시 유의사항

1. **테이블명 매핑**: `@@map("users")`처럼 실제 DB 테이블명을 명시 (기존 DB와 호환)
2. **컬럼명 매핑**: `@map("user_id")`처럼 snake_case → camelCase 매핑
3. **필드명은 Prisma 규약**: JavaScript에서 `user.userId` 형태로 접근 (DB에서는 `user_id`)
4. **createdAt/updatedAt 없음**: 기존 DB에 없으므로 추가하지 않음 (PROMPT 40 단계에서 함께 검토)
5. **DateTime 타입 사용 안 함**: 기존 DB가 모두 텍스트라 일단 String 유지 (이후 정리 가능)

---

## 작업 5: package.json 스크립트 추가

`package.json`의 scripts 섹션에 다음 추가:

```json
{
  "scripts": {
    "...": "...(기존 스크립트들)...",
    "db:generate": "prisma generate",
    "db:pull": "prisma db pull",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  }
}
```

기존 스크립트 절대 삭제 금지.

---

## 작업 6: Prisma Client 생성

```bash
npx prisma generate
```

이 명령은 `schema.prisma`를 읽어서 `node_modules/@prisma/client/` 안에 TypeScript/JavaScript 타입 정의와 클라이언트 코드를 자동 생성. 성공하면 다음 메시지가 표시됨:

```
✔ Generated Prisma Client (...) to ./node_modules/@prisma/client
```

---

## 작업 7: 기존 DB와 schema 일치 검증

```bash
npx prisma db pull
```

이 명령은 **기존 SQLite 파일**(`data/hrmanage.db`)을 읽어서 schema.prisma와 비교하고, 차이가 있으면 schema.prisma를 자동 업데이트.

⚠️ **주의**: 이 명령으로 schema.prisma가 변경되면, 그 차이를 확인하고 의도된 것인지 검토 필요.

### 기대 결과

**Case A (이상적)**: schema.prisma가 기존 DB와 100% 일치
→ "Already in sync" 같은 메시지

**Case B (일부 차이)**: schema.prisma에서 누락하거나 잘못 정의한 필드 발견
→ schema.prisma 자동 업데이트됨, 그 차이가 무엇인지 보고

**Case C (큰 차이)**: 테이블 자체가 빠짐
→ 본인이 작성한 schema.prisma 검토 후 수정 필요

### 보고 사항
작업 후 `git diff prisma/schema.prisma`로 변경 사항을 확인하고, 변경된 부분을 요약해서 사용자에게 보고.

---

## 작업 8: Prisma Studio로 시각 확인 (선택)

```bash
npx prisma studio
```

브라우저에서 자동으로 열림. http://localhost:5555. 17개 테이블이 모두 보이고 데이터가 표시되면 연결 성공.

확인 후 Ctrl+C로 종료.

---

## 작업 9: 문서 업데이트

### 9-1) ClaudeHRM.md 최근 개발 이력에 추가

```
| 2026-05-14 | Prisma ORM 도입 (schema.prisma 정의, DB 연결 확인) (PROMPT_36-1) | Claude Code |
```

### 9-2) ClaudeHRM.md "기술 스택 상세" 섹션 업데이트

기존 내용에 다음 추가:

```
ORM:        Prisma (스키마 기반, 멀티 DB 지원)
            - 개발: SQLite
            - 운영: PostgreSQL (추후 전환)
            - 향후 어댑터: MySQL, MSSQL, Oracle (Repository Pattern으로 확장)
```

### 9-3) ClaudeHRM.md "환경변수 (.env)" 섹션 업데이트

기존 표에 한 행 추가:

```
| DATABASE_URL | DB 연결 문자열 (Prisma) | file:../data/hrmanage.db |
```

### 9-4) ClaudeHRM.md "파일 구조" 섹션 업데이트

기존 파일 구조에 다음 추가:

```
├── prisma/
│   ├── schema.prisma          ← Prisma 스키마 정의 (17개 테이블)
│   └── migrations/            ← 추후 마이그레이션 파일들
```

### 9-5) CLAUDE.md "핵심 파일" 섹션에 한 줄 추가

```
prisma/schema.prisma     Prisma 스키마 (DB 종류 추상화)
```

---

## 작업 10: 자동 git 커밋 (PROMPT 35 규칙 적용)

작업 완료 후 자동 커밋:

```bash
cd C:\claudeprojects\hrmanage
git add .
git commit -m "Prisma ORM 도입 (schema.prisma 정의 + DB 연결 확인) (PROMPT_36-1)"
```

**중요**: push는 사용자가 직접 실행. Claude Code는 commit까지만.

---

## 작업 완료 후 보고 항목

1. 설치된 패키지 (prisma, @prisma/client) 버전
2. 생성된 파일 목록
3. .env에 추가된 DATABASE_URL 줄 (값은 가려도 됨)
4. `npx prisma db pull` 결과 (변경된 schema.prisma 부분이 있다면 요약)
5. `npx prisma studio`에서 보이는 테이블 수 (17개여야 정상)
6. 업데이트된 문서 항목 요약
7. 자동 커밋 해시
8. **사용자가 직접 해야 할 일**:
   - 브라우저에서 http://localhost:3000 접속해서 기존 시스템이 그대로 작동하는지 확인 (Prisma 도입은 했지만 server/index.js는 안 건드렸으므로 기존 동작 그대로여야 함)
   - 이상 없으면 `git push -u origin feat/prisma-orm` 실행

---

## 예상 문제와 대처

| 증상 | 원인 | 해결 |
|------|------|------|
| `npx prisma init` 시 .env 변수가 사라짐 | prisma init이 덮어씀 | 백업 후 수동 복원 |
| `prisma db pull` 시 "DB 파일 없음" 에러 | DATABASE_URL 경로 잘못 | `file:../data/hrmanage.db` 확인 |
| `prisma generate` 시 syntax error | schema.prisma 오타 | 에러 메시지가 가리키는 줄 확인 |
| 모델명/필드명 불일치로 schema 자동 변경 | 본 PROMPT의 스키마가 실제 DB와 다름 | 차이 확인 후 의도된 변경인지 검토 |
| `prisma studio` 접속 안 됨 | 다른 포트 사용 중 | `--port 5556` 등 옵션 사용 |
| 기존 서버(node server/index.js) 동작 이상 | 안 건드렸으므로 정상이어야 함. 이상하면 작업 중 실수 | 작업 내역 재확인 |

---

## 검증 체크리스트 (사용자가 직접 확인)

작업 완료 후 사용자 검증 순서:

1. **파일 존재 확인**
   ```powershell
   ls prisma/schema.prisma
   ls node_modules/@prisma/client
   ```

2. **기존 시스템 동작 확인** (가장 중요)
   ```powershell
   node server/index.js
   ```
   브라우저로 http://localhost:3000 접속 → 로그인 → AI 요약 등 정상 동작 확인. **Prisma는 아직 시스템에 영향 없어야 함.**

3. **Prisma Studio 동작 확인** (선택)
   ```powershell
   npx prisma studio
   ```
   http://localhost:5555 → 17개 테이블 보임 → 기존 데이터 보임

4. **이상 없으면 push**
   ```powershell
   git push -u origin feat/prisma-orm
   ```
