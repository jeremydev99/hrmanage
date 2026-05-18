# 작업 36-2: 정합성 정리 — ClaudeHRM.md 정정 + AppSetting 모델 수정

> 작성일: 2026-05-14
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 36-1 (Prisma 도입) 완료, 사용자가 schema.prisma 분석 완료
> 목적: schema.prisma와 ClaudeHRM.md 사이의 정합성 정리, AppSetting을 Prisma Client로 사용 가능하게 수정
> 위험도: 낮음 (문서 + schema 미세 조정, 코드 변경 없음)
> 후속 작업: PROMPT 36-3 (Repository Pattern 골격 + 첫 어댑터)

---

## 배경 — 36-1 후 발견 사항

### 발견 1: ClaudeHRM.md가 부정확한 정보 포함
- ClaudeHRM.md에는 `eval_approval_history` 테이블이 명시되어 있으나 **실제 DB에는 없음**
- 사용자가 PowerShell로 `SELECT name FROM sqlite_master`로 확인 완료
- 발견된 실제 사용 테이블: **20개** (시스템 sqlite_sequence 제외)

### 발견 2: schema.prisma에 자동 추가된 컬럼 다수
- `prisma db pull`이 실제 DB를 보고 자동 보강
- ClaudeHRM.md에 누락되었던 컬럼들: `created_at`, `updated_at`, `phase2`, `second_selected_grade`, `file_type`, `file_size`, `submitted_at`, `approved_at` 등

### 발견 3: AppSetting 모델만 Prisma Client에서 사용 불가
- 원인: `key String? @id` — Nullable이면서 Primary Key (모순)
- Prisma가 `@@ignore` 처리하여 Client 코드 생성 안 함
- 영향: server/index.js의 app_settings 관련 모든 코드가 Prisma 호출 불가

---

## 작업 전 확인사항

1. 현재 브랜치가 `feat/prisma-orm`인지 확인 (`git branch`)
2. `git status`가 깨끗한지 확인
3. CLAUDE.md, ClaudeHRM.md 먼저 읽기
4. 현재 prisma/schema.prisma 파일 확인

---

## 작업 1: schema.prisma의 AppSetting 모델 수정

### 위치
`prisma/schema.prisma` 파일 안의 `model AppSetting` 블록

### 현재 상태
```prisma
/// The underlying table does not contain a valid unique identifier and can therefore currently not be handled by Prisma Client.
model AppSetting {
  key       String? @id
  value     String?
  updatedBy Int?    @map("updated_by")
  updatedAt String? @map("updated_at")

  @@map("app_settings")
  @@ignore
}
```

### 변경 후 상태
```prisma
model AppSetting {
  key       String  @id
  value     String?
  updatedBy Int?    @map("updated_by")
  updatedAt String? @map("updated_at")

  @@map("app_settings")
}
```

### 변경 내용
1. **`key String? @id` → `key String @id`** (`?` 제거 — Primary Key는 NOT NULL이어야 함)
2. **상단 주석 라인 삭제** (`/// The underlying table...`)
3. **`@@ignore` 삭제**

### 변경 후 검증 명령
```bash
npx prisma generate
```
성공하면 Prisma Client가 AppSetting을 포함하여 재생성됨. 에러 없으면 OK.

### ⚠️ 실제 DB 변경 안 함
이 작업은 **schema.prisma 파일만** 수정. 실제 DB의 app_settings 테이블에는 변경 없음.
- SQLite는 원래 NULL을 허용하는 Primary Key를 허용함 (관대한 동작)
- 우리 schema에서 `key`를 NOT NULL로 명시해도 실제 데이터는 그대로 유지됨
- 추후 PostgreSQL 전환 시(PROMPT 40), 데이터 검증과 함께 실제 컬럼 제약도 정리

### ❌ 실행하지 말 것
- `npx prisma db push` — 절대 실행 금지 (DB 스키마를 schema.prisma에 맞춰 변경하려 함, 위험)
- `npx prisma migrate dev` — 절대 실행 금지 (마이그레이션 파일 생성)
- 이 두 명령은 PROMPT 40 단계에서만 사용

---

## 작업 2: ClaudeHRM.md 정정

### 2-1) "DB 스키마" 섹션 수정

ClaudeHRM.md의 "## DB 스키마" 블록을 다음으로 교체:

````markdown
## DB 스키마

> 실제 DB 기반 (2026-05-14 prisma db pull 검증). 총 20개 사용 테이블 + 1개 시스템(sqlite_sequence).
> Prisma 모델명은 PascalCase, DB 테이블명은 snake_case (`@@map`으로 매핑).

```sql
users              id, name, email, password_hash, role, dept, title,
                   manager_id, is_active, account_status, signup_note,
                   grade, eval_mode, org_id, created_at
organizations      id, name, leader_id, parent_id, description,
                   sort_order, is_active, created_at
eval_cycles        id, user_id, period_type, period_label, eval_year(TEXT),
                   phase, self_reason(암호화), submitted_at, approved_at,
                   locked, created_at, updated_at, reject_reason, phase2
goals              id, eval_id, category_id, name(암호화), kpi(암호화),
                   weight, sort_order, status, created_at
goal_categories    id, name, description, weight, color, text_color,
                   sort_order, is_active, created_by, created_at
goal_approvals     id, eval_id, approver_id, level, action, note(암호화),
                   created_at
feedbacks          id, eval_id, author_id, overall_note(암호화), created_at
feedback_items     id, feedback_id, goal_id, score, note(암호화), created_at
final_evaluations  id, eval_id, self_note(암호화), self_done, self_done_at,
                   mgr_note(암호화), mgr_done, mgr_done_at, mgr_approver_id,
                   final_score, final_grade, locked, locked_at,
                   created_at, updated_at, second_mgr_done,
                   second_mgr_note(암호화), second_mgr_id, second_mgr_done_at,
                   selected_grade, second_selected_grade
final_eval_scores  id, final_id, goal_id, self_score, mgr_score,
                   second_mgr_score, created_at
progress_reports   id, eval_id, author_id, content(암호화),
                   created_at, updated_at
report_files       id, report_id, feedback_id, final_eval_id,
                   file_name, file_data, file_type, file_size, created_at
app_settings       key(PK), value, updated_by, updated_at
eval_periods       id, period_type, period_label, eval_year(TEXT),
                   is_active, created_by, created_at, eval_mode, locked
eval_period_modes  id, period_id, manager_id, eval_mode, locked, created_at
                   UNIQUE(period_id, manager_id)
audit_logs         id, user_id, action, ip, created_at,
                   target_id, target_name, detail
grade_criteria     id, grade_code, grade_name, description, note,
                   sort_order, is_active, created_at
okr_cycles         id, user_id, period_label, eval_year(TEXT), phase,
                   created_at, updated_at
okr_objectives     id, cycle_id, title, description, sort_order
okr_key_results    id, objective_id, title, target_value, current_value,
                   unit, weight, sort_order
```

### 참고 사항
- `eval_year`는 TEXT 타입 — 정수 비교 시 주의 (`'2026' === 2026`은 false)
- `(암호화)` 표시된 필드는 AES-256-CBC로 자동 암호화/복호화
- `created_at`, `updated_at`, `*_at` 컬럼은 SQLite의 `datetime('now')`로 자동 설정
````

### 2-2) "최근 개발 이력" 표에 추가

ClaudeHRM.md 최근 개발 이력 표 **최상단**에 한 행 추가:

```
| 2026-05-14 | DB 스키마 정합성 정리 (eval_approval_history 제거, 컬럼 정정, AppSetting Prisma 사용 가능) (PROMPT_36-2) | Claude Code |
```

### 2-3) "알려진 버그 및 미완성" 섹션 정리

만약 ClaudeHRM.md의 "알려진 버그 및 미완성" 섹션에 `eval_approval_history` 관련 항목이 있다면 삭제.

---

## 작업 3: 자동 git 커밋

```bash
cd C:\claudeprojects\hrmanage
git add prisma/schema.prisma ClaudeHRM.md
git commit -m "DB 스키마 정합성 정리 (AppSetting @@ignore 제거, 실제 컬럼 반영) (PROMPT_36-2)"
```

**push는 사용자가 직접 실행** (PROMPT 35 규칙).

---

## 작업 완료 후 사용자에게 보고할 내용

1. **수정된 파일 목록** (`prisma/schema.prisma`, `ClaudeHRM.md`)
2. **schema.prisma 변경 사항 요약** (AppSetting 모델의 3가지 변경)
3. **ClaudeHRM.md 변경 사항 요약** (DB 스키마 섹션 통째 교체, 개발 이력 추가)
4. **`npx prisma generate` 결과** — 성공 메시지
5. **자동 커밋 해시**
6. **사용자가 직접 할 일**:
   - `git push` 실행
   - (선택) `npx prisma studio` 실행해서 AppSetting 테이블이 이제 보이는지 확인

---

## 예상 문제와 대처

| 증상 | 원인 | 해결 |
|------|------|------|
| `prisma generate` 실패 | schema.prisma 문법 오류 | 에러 메시지의 줄 번호 확인 |
| AppSetting 여전히 `@@ignore`로 표시 | 수정이 반영 안 됨 | 파일 다시 확인 후 저장 |
| ClaudeHRM.md 줄 번호 헷갈림 | 파일 구조 변동 | "## DB 스키마" 헤더로 검색 |

---

## 검증 체크리스트 (사용자가 직접)

작업 완료 후:

1. **schema.prisma 확인**
   ```powershell
   findstr "AppSetting" prisma\schema.prisma
   ```
   `@@ignore` 줄이 없으면 OK.

2. **Prisma Client 재생성 확인**
   ```powershell
   npx prisma generate
   ```
   성공 메시지 확인.

3. **(선택) Prisma Studio로 시각 확인**
   ```powershell
   npx prisma studio
   ```
   AppSetting 테이블이 목록에 보이면 OK. (이전엔 @@ignore로 안 보였음)

4. **기존 시스템 정상 동작 확인**
   ```powershell
   node server/index.js
   ```
   브라우저에서 http://localhost:3000 → dev3 로그인 → 정상이면 OK.

5. **이상 없으면 push**
   ```powershell
   git push
   ```

---

## ⚠️ 절대 하지 말 것

- ❌ `npx prisma db push` 실행 (DB 스키마를 강제로 변경 — 데이터 손실 위험)
- ❌ `npx prisma migrate reset` 실행 (DB 전체 초기화)
- ❌ `prisma/schema.prisma`에서 다른 모델 임의 수정
- ❌ 데이터 파일(`data/hrmanage.db`) 직접 수정
