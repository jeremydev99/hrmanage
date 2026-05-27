# INFRA-2A-2 영향 분석 보고서

> 작성: 2026-05-27 (PROMPT 53)
> 목적: PostgreSQL 전환 시 코드 변경 필요 영역 식별
> 결론: **어댑터 7개 전체 `_flatten`/`toSnakeCase` 수정 필요 + EvalCycleRepository DateTime 쓰기 방식 수정 + raw SQL 12건 NOW() 교체 필요. INFRA-2A-3 작업량 중간 수준.**

---

## 1. Pattern A — `datetime('now')` 직접 호출

### 발견 위치 (활성 DML — 12건)

| 파일 | 라인 | 코드 |
|------|------|------|
| server/index.js | 159 | `VALUES('notice', ?, ?, datetime('now'))` |
| server/index.js | 190 | `VALUES('session_policy',?,?,datetime('now'))` |
| server/index.js | 696 | `UPDATE eval_cycles SET phase='pending',approved_at=NULL,updated_at=datetime('now') WHERE id=?` |
| server/index.js | 759 | `UPDATE eval_cycles SET phase='approved',approved_at=datetime('now'),updated_at=datetime('now') WHERE id=?` |
| server/index.js | 791 | `UPDATE eval_cycles SET phase='rejected',reject_reason=?,updated_at=datetime('now') WHERE id=?` |
| server/index.js | 936 | `UPDATE eval_cycles SET phase='final_mgr_pending',updated_at=datetime('now') WHERE id=?` |
| server/index.js | 1000 | `UPDATE eval_cycles SET phase='final_done',locked=1,updated_at=datetime('now') WHERE id=?` |
| server/index.js | 1039 | `UPDATE eval_cycles SET phase='final_mgr2_pending',updated_at=datetime('now') WHERE id=?` |
| server/index.js | 1041 | `UPDATE eval_cycles SET phase='final_done',locked=1,updated_at=datetime('now') WHERE id=?` |
| server/index.js | 1045 | `UPDATE eval_cycles SET phase='final_done',locked=1,updated_at=datetime('now') WHERE id=?` |
| server/index.js | 1721 | `VALUES('dashboard_depth',?,?,datetime('now'))` |
| server/index.js | 2519 | `VALUES('notice', ?, 1, datetime('now'))` |

### 발견 위치 (CREATE TABLE DDL defaults — 14건+, 비활성화 대상)

server/index.js 2273~2439 사이 CREATE TABLE 구문의 `DEFAULT (datetime('now'))` — SQLite 초기화 DDL.
PostgreSQL 전환 시 이 DDL은 사용하지 않고 Prisma migration으로 대체되므로 직접 변경 불필요.

### 발견 위치 (주석 처리됨 — 무시)

Lines 1288, 1362, 1365, 2207–2216: 이미 주석으로 비활성화.

### PostgreSQL 전환 영향

- **영향도**: 높음
- **대상 구분**:
  - Lines 159, 190, 1721, 2519 → `app_settings` 테이블 INSERT. Prisma 어댑터 없음 → raw SQL 교체 또는 어댑터 신규 추가 필요
  - Lines 696–1045 → `eval_cycles` 승인/거절/최종완료 phase 전환. EvalCycleRepository 어댑터에 일부 메서드 존재하나 이 라우트들은 아직 raw SQL 그대로 사용 중 → INFRA-2A-4 직전에 `NOW()` 교체 또는 어댑터 전환
- **변경 패턴**:
  - raw SQL 유지 시: `datetime('now')` → `NOW()` (PostgreSQL 표준)
  - Prisma 어댑터 경유 시: 어댑터 write path에서 `new Date()` 사용 (Prisma가 자동 처리)

---

## 2. Pattern B — Boolean 의미 정수 비교

### 발견 위치

#### B-1: `is_active` 비교 (server/index.js)

| 라인 | 코드 |
|------|------|
| 205 | `WHERE email=? AND is_active=1` |
| 291 | `UPDATE users SET ..., is_active=1, ...` |
| 299 | `UPDATE users SET account_status='rejected', is_active=0` |
| 1082 | `WHERE is_active=1 ORDER BY eval_year` |
| 1177 | `WHERE o.is_active=1 AND o.leader_id IS NOT NULL` |
| 1435, 1464 | `WHERE is_active=1 ORDER BY id DESC` |
| 1617 | `WHERE is_active=1 AND (account_status='approved' ...)` |
| 1738 | `WHERE is_active=1 ORDER BY id DESC` |
| 1809, 1814, 1815, 1822 | `WHERE ... is_active=1` |

주석 처리됨: Lines 332, 391

#### B-1: `is_active` 비교 (어댑터)

| 파일 | 코드 |
|------|------|
| PrismaOrganizationRepository.js:38 | `where: { isActive: 1 }` |
| PrismaOrganizationRepository.js:84 | `data: { isActive: 0 }` |
| PrismaUserRepository.js:59 | `where: { isActive: 1 }` |
| PrismaUserRepository.js:67 | `where: { orgId, isActive: 1 }` |
| PrismaGoalCategoryRepository.js:36 | `where: { isActive: 1 }` |
| PrismaGoalCategoryRepository.js:67 | `isActive: data.is_active ?? 1` |
| PrismaGoalCategoryRepository.js:77 | `data: { isActive: 0 }` |

#### B-2: `locked` 비교

| 라인 | 코드 |
|------|------|
| 1000, 1041, 1045 | `locked=1` (raw SQL UPDATE) |
| 1212 | `UPDATE eval_periods SET locked=1` |
| 1213 | `UPDATE eval_period_modes SET locked=1` |
| PrismaEvalCycleRepository.js:132 | `locked: Number(locked)` |
| PrismaFinalEvaluationRepository.js:108, 161 | `locked: Number(...)`, `locked: 0` |

#### B-3: `*_done` 비교

| 라인 | 코드 |
|------|------|
| server/index.js:2086 | `AND fe.mgr_done=1` |
| server/index.js:2208–2211 (주석) | `self_done=0, mgr_done=0, second_mgr_done=0` |
| PrismaFinalEvaluationRepository.js:94–102 | `selfDone, mgrDone, secondMgrDone` (Number 변환 후 저장) |
| PrismaFinalEvaluationRepository.js:163–167 | `selfDone: 0, mgrDone: 0, secondMgrDone: 0` |

### PostgreSQL 전환 영향 (즉시)

- **영향도**: 낮음 (PROMPT 46에서 Int 유지로 결정)
- **사전 조치**: 즉시 변경 불필요. 0/1 정수 값은 PostgreSQL Int 컬럼과 호환.

### INFRA-2B CHECK 제약 추가 시 영향

- CHECK 제약(`is_active IN (0,1)` 등) 추가 시 코드가 NULL이나 다른 정수를 삽입하는 경우 위반
- 현재 코드를 보면 0 또는 1만 사용하고 있어 정상 동작 예상
- 단 `isActive: data.is_active ?? 1` (PrismaGoalCategoryRepository:67) — 입력이 `0`일 때 정상 통과 확인 필요 (`??` 연산자는 null/undefined일 때만 기본값 사용)

---

## 3. Pattern C — `_flatten` 함수 일관성

### 핵심 이슈

현재 SQLite `schema.prisma`: 시각 필드가 `created_at String?` 형태로 **snake_case 필드명** 직접 사용 → Prisma 응답도 `created_at` (snake_case).

PostgreSQL `schema.postgresql.prisma`: `createdAt DateTime? @map("created_at")` 형태로 **camelCase 필드명** 사용 → Prisma 응답은 `createdAt` (camelCase).

이 차이로 인해 `...rest` 스프레드나 직접 필드 접근이 모두 영향을 받는다.

### 어댑터별 `_flatten` 구현 상태

| 어댑터 | 변환 방식 | `created_at` 처리 | PostgreSQL 전환 시 위험 |
|--------|-----------|------------------|------------------------|
| PrismaUserRepository | `toSnakeCase()` 함수 | `created_at: user.created_at` | **중간** — PostgreSQL에서 `user.created_at`은 `undefined` (`createdAt`으로 반환됨) |
| PrismaGoalCategoryRepository | `toSnakeCase()` 함수 | `created_at: cat.created_at` | **중간** — 동일 |
| PrismaGradeCriteriaRepository | `toSnakeCase()` 함수 | `created_at: item.created_at` | **중간** — 동일 |
| PrismaOrganizationRepository | `_flatten()` + `...rest` | `...rest`에 포함 | **높음** — `...rest`에 `createdAt` (camelCase)으로 들어가 클라이언트에 잘못된 키 노출 |
| PrismaEvalCycleRepository | `_flatten()` + `...rest` | `submitted_at`, `approved_at`, `created_at`, `updated_at` 모두 `...rest`에 | **높음** — PostgreSQL 전환 후 클라이언트가 기대하는 `submitted_at` 등이 `undefined` |
| PrismaGoalRepository | `_flatten()` + `...rest` | `created_at` `...rest`에 | **높음** — 동일 |
| PrismaFeedbackRepository | `_flattenFeedback()` + `...rest` | `created_at` `...rest`에 | **높음** — 동일 |
| PrismaFinalEvaluationRepository | `_flatten()` + **명시적 snake_case destructure** | `self_done_at`, `mgr_done_at`, `locked_at`, `second_mgr_done_at` 직접 destructure | **치명적** — 아래 별도 설명 |
| PrismaProgressReportRepository | `_flatten()` + `...rest` | `created_at` `...rest`에 | **높음** — 동일 |

### PrismaFinalEvaluationRepository — 치명적 위험

현재 `_flatten()`:
```javascript
const {
  scores, evalId, selfNote, selfDone, self_done_at,   // ← snake_case
  mgrNote, mgrDone, mgr_done_at, mgrApproverId,       // ← snake_case
  finalScore, finalGrade, selectedGrade,
  secondMgrDone, second_mgr_done_at, secondMgrNote, secondMgrId,  // ← snake_case
  second_selected_grade, locked_at, evalCycle,         // ← snake_case
  ...rest
} = fe;
return { ..., self_done_at, mgr_done_at, locked_at, second_mgr_done_at, ... };
```

PostgreSQL 스키마에서 Prisma는 `selfDoneAt`, `mgrDoneAt`, `lockedAt`, `secondMgrDoneAt` (camelCase)로 반환.
→ destructure 결과: `self_done_at = undefined`, `mgr_done_at = undefined` 등
→ `...rest`에는 `selfDoneAt`, `mgrDoneAt` 등 camelCase로 들어감
→ API 응답: 날짜 필드 전부 `undefined` + 잘못된 camelCase 키 포함 → **즉각 기능 장애**

또한 `upsert()` 메서드에서도 `updateData.self_done_at = data.self_done_at` 등 snake_case로 쓰기 시도 → PostgreSQL schema 필드명 `selfDoneAt`과 불일치 → Prisma 에러.

### 누락/불일치 위험 있는 필드 요약

- `created_at` (String → Date): 7개 어댑터 전체
- `updated_at` (EvalCycle, FinalEvaluation, ProgressReport 등)
- `submitted_at`, `approved_at` (EvalCycle)
- `self_done_at`, `mgr_done_at`, `locked_at`, `second_mgr_done_at` (FinalEvaluation — 가장 위험)

---

## 4. Pattern D — Prisma 응답의 DateTime 객체

### 현재 SQLite 환경에서의 동작

- `schema.prisma`: 모든 시각 필드가 `String?`
- Prisma 반환값: 문자열 `"2026-05-20 12:34:56"` (SQLite 포맷)
- `res.json()` 직렬화: 그대로 문자열 전달

### EvalCycleRepository — DateTime 쓰기 문제

3곳에서 `updated_at`을 다음과 같이 쓰고 있음:
```javascript
// PrismaEvalCycleRepository.js:102, 122, 133
updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
// → "2026-05-20 12:34:56" (string)
```

SQLite에서는 `String?` 필드이므로 문제없음. PostgreSQL 전환 시:
- `updatedAt DateTime? @map("updated_at")` 필드에 string 쓰기 → Prisma가 자동 캐스팅 시도하나 불명확
- 안전한 방식: `new Date()` (Date 객체) 직접 전달

### PostgreSQL 전환 시 변경 사항

- Prisma 반환값: JavaScript `Date` 객체
- `res.json()` 직렬화: 자동으로 ISO 8601 문자열 `"2026-05-20T03:34:56.000Z"` (UTC 기준)

### 클라이언트 영향 점검

| 클라이언트 패턴 | 현재 (SQLite 문자열) | 변경 후 (ISO 8601) | 이상 유무 |
|----------------|---------------------|-------------------|-----------|
| `.slice(0,10)` | `"2026-05-20 12..."` → `"2026-05-20"` ✓ | `"2026-05-20T..."` → `"2026-05-20"` ✓ | 없음 |
| `.slice(0,16).replace('T',' ')` | `"2026-05-20 12:34"` ✓ | `"2026-05-20T12:3"` → `"2026-05-20 12:3"` ⚠ | 분 절삭 버그 |
| `new Date(e.created_at)` 비교 | 파싱 가능 ✓ | ISO string, 파싱 가능 ✓ | 없음 |
| `String(b.created_at).localeCompare(...)` | 문자열 사전순 ✓ | ISO string도 사전순 정렬 가능 ✓ | 없음 |

**`.slice(0,16).replace('T',' ')` 버그**: ISO 문자열에서 `.slice(0,16)`은 `"2026-05-20T12:3"` (분이 1자리 잘림). 현재 코드는 SQLite 형식 `"2026-05-20 12:34:56"`을 가정함.
영향 파일: `admin.js:1100`, `approvals.js:167`, `final-eval.js:376`, `progress-report.js:108, 215`

**시간대 주의**: ISO UTC string을 그대로 `.slice(0,10)`하면 UTC 기준 날짜. 서버가 UTC+9에서 자정 전(UTC 15:00~00:00) 생성된 레코드는 날짜가 하루 차이 가능. → 어댑터 `_flatten()`에서 `toISOString()` 대신 한국 시간 기준 포맷으로 변환 권장.

### 권장 조치 (INFRA-2A-3)

어댑터 `_flatten()`에서 DateTime 필드를 명시적으로 ISO string으로 변환:
```javascript
// 변환 헬퍼 예시
_toStr(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString().replace('T', ' ').slice(0, 19);
  return dt;
}
```
이렇게 하면 SQLite(String 반환)와 PostgreSQL(Date 반환) 모두 동일 포맷 출력 → 클라이언트 코드 무변경.

---

## 5. INFRA-2A-3 작업 우선순위

높음 → 낮음 순:

1. **(치명) PrismaFinalEvaluationRepository `_flatten` 전면 수정** — `self_done_at` 등 snake_case 직접 destructure → camelCase 대응 + DateTime → string 변환 추가. PostgreSQL 전환 직후 즉각 기능 장애 발생.
2. **(높음) PrismaEvalCycleRepository `updated_at` 쓰기 방식 수정** — `new Date().toISOString().slice(0,19).replace('T',' ')` → `new Date()` (3곳: line 102, 122, 133). PostgreSQL DateTime 타입 안전 호환.
3. **(높음) 7개 어댑터 `_flatten`/`toSnakeCase` PostgreSQL camelCase 대응** — `...rest` 또는 직접 필드 접근이 PostgreSQL 스키마 변경 후 깨짐. 어댑터마다 camelCase → snake_case 명시 변환 + `_toStr()` 헬퍼 적용.
   - PrismaOrganizationRepository, PrismaEvalCycleRepository, PrismaGoalRepository, PrismaFeedbackRepository, PrismaProgressReportRepository: `...rest` 패턴
   - PrismaUserRepository, PrismaGoalCategoryRepository, PrismaGradeCriteriaRepository: `toSnakeCase()` 내 `created_at: user.created_at` 직접 접근
4. **(중간) 클라이언트 `.slice(0,16).replace('T',' ')` 패턴 수정** — ISO string 14자 절삭 버그 5곳. 어댑터 `_toStr()` 헬퍼가 `"YYYY-MM-DD HH:MM:SS"` 포맷 반환하면 자동 해결.
5. **(낮음) Pattern B Boolean 정수 비교** — Int 유지 결정으로 즉시 조치 불필요.

---

## 6. INFRA-2A-4 마이그레이션 사전 조치 사항

마이그레이션 직전 반드시 완료해야 할 코드 변경:

- [ ] **모든 어댑터 `_flatten` + `toSnakeCase` PostgreSQL camelCase 대응** (INFRA-2A-3에서 처리)
- [ ] **PrismaFinalEvaluationRepository `upsert()`에서 snake_case write 키 → camelCase 수정** (`self_done_at` → `selfDoneAt` 등)
- [ ] **PrismaEvalCycleRepository `updated_at` 쓰기 → `new Date()` 변경** (3곳)
- [ ] **raw SQL `datetime('now')` DML 12건 → `NOW()` 교체** (app_settings 4건 + eval_cycles 8건)
  - 대안: raw SQL 라우터를 Prisma 어댑터로 전환 후 `new Date()` 사용
- [ ] **어댑터 `_toStr()` DateTime 헬퍼 추가** (모든 어댑터 공통)

---

## 7. 결론

| 항목 | 건수 | 영향도 |
|------|------|--------|
| Pattern A — raw SQL `datetime('now')` 활성 DML | 12건 | 높음 |
| Pattern B — Boolean 정수 비교 | 20건+ | 낮음 (즉시 조치 불필요) |
| Pattern C — `_flatten` camelCase 불일치 | 9개 어댑터 전체 | 높음~치명 |
| Pattern D — DateTime 객체 → string 변환 누락 | 9개 어댑터 + 클라이언트 5곳 | 높음 |

**INFRA-2A-3 예상 작업량**: **중간** (어댑터 9개 수정 + raw SQL 12건 교체, 각 파일은 소규모 변경이나 전체 파일 수가 많음)

**INFRA-2A-4 마이그레이션 안전성**: 현재 상태로는 마이그레이션 불가. INFRA-2A-3 완료 후 진행 가능. 단 `_flatten` 수정은 SQLite/PostgreSQL 양쪽 호환으로 작성 가능하므로 마이그레이션 전 사전 배포 가능.
