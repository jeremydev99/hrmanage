# ㈜사이냅소프트 인사평가 시스템 — 상세 명세

> 이 파일은 CLAUDE.md의 상세 명세 부분입니다.
> Claude Code 세션에서 참조: `cat ClaudeHRM.md`
> 업데이트: 작업 완료 후 반드시 이 파일도 업데이트

---

## 파일 구조

```
C:\claudeprojects\hrmanage\
├── CLAUDE.md                  ← 세션 가이드 (간결)
├── ClaudeHRM.md               ← 이 파일 (상세 명세)
├── README.md                  ← 사용자용 설치 가이드
├── package.json
├── 실행.bat
├── Dockerfile                 ← 컨테이너 이미지 정의 (node:20-alpine)
├── docker-compose.yml         ← 오케스트레이션 (volumes, env, healthcheck)
├── .dockerignore              ← 빌드 제외 파일
├── server/
│   ├── index.js               ← 메인 서버 전체 (API + DB + 암호화 + 시드, ~2000줄)
│   ├── repositories/           ← DB 추상화 인터페이스
│   │   ├── README.md
│   │   ├── UserRepository.js
│   │   ├── GoalCategoryRepository.js
│   │   ├── GradeCriteriaRepository.js
│   │   ├── OrganizationRepository.js
│   │   ├── EvalCycleRepository.js
│   │   ├── GoalRepository.js
│   │   ├── FeedbackRepository.js
│   │   └── FinalEvaluationRepository.js
│   ├── adapters/               ← DB 어댑터 구현
│   │   └── prisma/
│   │       ├── README.md
│   │       ├── PrismaUserRepository.js
│   │       ├── PrismaGoalCategoryRepository.js
│   │       ├── PrismaGradeCriteriaRepository.js
│   │       ├── PrismaOrganizationRepository.js
│   │       ├── PrismaEvalCycleRepository.js
│   │       ├── PrismaGoalRepository.js
│   │       ├── PrismaFeedbackRepository.js
│   │       └── PrismaFinalEvaluationRepository.js
│   └── config/                 ← 어댑터 선택 로직
│       └── repository-factory.js
├── public/
│   ├── index.html             ← SPA 진입점
│   ├── css/style.css
│   └── js/
│       ├── api.js             ← fetch 래퍼 (base: '/api')
│       ├── app.js             ← SPA 라우터, Pages 초기화, 세션관리, 드롭다운
│       ├── components.js
│       └── pages/
│           ├── login.js
│           ├── my-eval.js
│           ├── approvals.js
│           ├── feedback.js
│           ├── progress-report.js
│           ├── final-eval.js
│           ├── okr-eval.js    ← OKR 작성/진행률/기간선택
│           └── admin.js       ← 관리자 설정 전체
├── prisma/
│   ├── schema.prisma          ← Prisma 스키마 정의 (20개 테이블)
│   └── migrations/            ← 추후 마이그레이션 파일들
└── data/hrmanage.db
```

---

## 기술 스택 상세

```
런타임:     Node.js 18+
프레임워크: Express 4
DB:         better-sqlite3 (SQLite) — 기존 쿼리 유지
ORM:        Prisma 5.22.0 (스키마 기반, 멀티 DB 지원)
            - 개발: SQLite (file:../data/hrmanage.db, schema.prisma 기준)
            - 운영: PostgreSQL (추후 전환)
            - 향후 어댑터: MySQL, MSSQL, Oracle (Repository Pattern으로 확장)
            ※ Prisma 7은 CommonJS 호환 복잡으로 5.x 사용 결정 (2026-05-14)
인증:       JWT 8h, AES-256-CBC 암호화
보안:       helmet, cors, bcryptjs
```

### 암호화 필드
goals: name, kpi / eval_cycles: self_reason / goal_approvals: note
feedbacks: overall_note / feedback_items: note
final_evaluations: self_note, mgr_note, second_mgr_note

---

## 환경변수 (.env)

| 변수 | 용도 | 기본값 (fallback) |
|------|------|------|
| LLM_API_BASE | 사내 LLM 엔드포인트 | https://chat.synap.co.kr/api/chat/completions |
| LLM_API_KEY | 사내 LLM API 키 | (없음 — 호출 실패) |
| LLM_MODEL | 사용 모델명 | SynapAssistant-MoE-30B |
| JWT_SECRET | JWT 토큰 서명 키 | synap-hr-local-dev-secret-2025 |
| ENC_SECRET | AES-256-CBC 암호화 키 | synap-local-enc-secret-32bytes!! |
| PORT | 서버 포트 | 3000 |
| DATABASE_URL | DB 연결 문자열 (Prisma) | file:../data/hrmanage.db |
| DATA_ADAPTER | DB 어댑터 선택 | prisma |
| SQLITE_JOURNAL_MODE | SQLite journal mode (로컬은 WAL, Docker는 DELETE) | WAL |

- 사용 가능 모델: SynapAssistant-MoE-30B, SynapAssistant-27B
- 응답 포맷: OpenAI 호환 (`data.choices[0].message.content`)
- 요청 시 `stream: false` 명시 필수

---

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

---

## 테스트 계정

| 이름 | 이메일 | 비번 | 권한 |
|------|--------|------|------|
| 이대표 | ceo@synapsoft.com | admin1234 | master |
| 김인사 | hr1@synapsoft.com | admin1234 | master |
| 박인사 | hr2@synapsoft.com | admin1234 | admin |
| 최개발 | dev1@synapsoft.com | user1234 | user |
| 정개발 | dev2@synapsoft.com | user1234 | user |
| 한개발 | dev3@synapsoft.com | user1234 | user |
| 오영업 | sales1@synapsoft.com | user1234 | user |
| 강영업 | sales2@synapsoft.com | user1234 | user |

조직도: dev3 → dev2 → dev1 → CEO

---

## API 엔드포인트 전체 목록

```
POST   /api/auth/login                  로그인
POST   /api/auth/signup                 가입 신청
GET    /api/auth/me                     내 정보

GET    /api/users                       전체 사용자 목록 (org_id 포함)
POST   /api/users                       사용자 추가 (admin+)
PATCH  /api/users/:id                   사용자 수정 (admin+)
GET    /api/users/:id/approvers         승인자 체인 조회
GET    /api/users/signup-requests       가입 신청 목록 (admin+)
POST   /api/users/:id/approve           가입 승인 (admin+)
POST   /api/users/:id/reject            가입 거절 (admin+)
POST   /api/users/:id/toggle-active     계정 활성/비활성 토글 (admin+)
PATCH  /api/users/:id/org               사용자 조직 변경 (admin+)
PATCH  /api/users/:id/eval-mode         특정 사용자 평가 방식 설정 (admin+)

GET    /api/categories                  카테고리 목록
POST   /api/categories                  카테고리 추가 (admin+)
PUT    /api/categories/:id              카테고리 수정 (admin+)
DELETE /api/categories/:id              카테고리 삭제=비활성화 (master)

GET    /api/evals                       평가 목록
POST   /api/evals                       평가 사이클 생성
GET    /api/evals/:id/goals             목표 목록
POST   /api/evals/:id/goals             목표 저장
POST   /api/evals/:id/submit            승인 요청 제출
POST   /api/evals/:id/cancel            승인 요청 취소
GET    /api/evals/my-history            내 목표 승인 이력
GET    /api/evals/my-mgr-pending        final_mgr_pending 목록

GET    /api/approvals/pending           승인할 목표 목록
POST   /api/approvals/:evalId/approve   승인
POST   /api/approvals/:evalId/reject    반려
GET    /api/approvals/:evalId/history   승인 이력
GET    /api/approvals/my-history        내 승인 이력
PATCH  /api/approvals/:id               승인 의견 수정
DELETE /api/approvals/:id               승인 취소

GET    /api/feedback/:evalId            피드백 목록
POST   /api/feedback/:evalId            피드백 제출

GET    /api/final/:evalId               최종 평가 조회
POST   /api/final/:evalId/self          자기 최종평가 제출
POST   /api/final/:evalId/mgr           상사 최종평가 확정

GET    /api/reports/:evalId             중간 보고 목록
POST   /api/reports/:evalId             중간 보고 제출
GET    /api/files/:fileId               파일 다운로드

GET    /api/eval-periods                평가 기간 목록
GET    /api/eval-periods/active         활성 기간
GET    /api/eval-periods/my-modes       활성 기간별 내 평가방식
POST   /api/eval-periods                기간 추가 (admin+)
PATCH  /api/eval-periods/:id/toggle     활성/비활성 토글 (admin+)
DELETE /api/eval-periods/:id            기간 삭제 (master, eval_period_modes도 삭제)
GET    /api/eval-periods/:id/eval-mode  기간 전사 기본방식 조회 (admin+)
POST   /api/eval-periods/:id/eval-mode  기간 전사 기본방식 설정 (admin+)
GET    /api/eval-periods/:id/org-modes  기간 조직별 방식 조회 (admin+)
POST   /api/eval-periods/:id/org-modes  기간 조직별 방식 설정 (admin+)
POST   /api/eval-periods/:id/lock       기간 방식 잠금 (admin+)

GET    /api/grade-criteria              등급 기준 목록
POST   /api/grade-criteria              등급 추가 (admin+)
PUT    /api/grade-criteria/:id          등급 수정 (admin+)
DELETE /api/grade-criteria/:id          등급 삭제 (admin+)

GET    /api/organizations               조직 목록
POST   /api/organizations               조직 추가 (admin+)
PUT    /api/organizations/:id           조직 수정 (admin+)
DELETE /api/organizations/:id           조직 삭제 (master)
GET    /api/organizations/:id/members   조직 멤버 조회

GET    /api/settings/approval-edit      승인 수정/취소 허용
POST   /api/settings/approval-edit      승인 수정/취소 설정 (admin+)
GET    /api/settings/history-visibility 이력 공개 설정
POST   /api/settings/history-visibility 이력 공개 설정 (admin+)
GET    /api/settings/feedback-limit     피드백 횟수 제한
POST   /api/settings/feedback-limit     피드백 횟수 제한 (admin+)
GET    /api/settings/history-inactive   비활성 기간 이력 공개
POST   /api/settings/history-inactive   비활성 기간 이력 공개 (admin+)
GET    /api/settings/second-final       2차 최종평가 허용
POST   /api/settings/second-final       2차 최종평가 허용 (admin+)
GET    /api/settings/timezone           시간대 조회
POST   /api/settings/timezone           시간대 변경 (master)
GET    /api/settings/my-eval-mode       내 평가 방식 조회 (조직장 상속)
POST   /api/settings/team-eval-mode     팀 평가 방식 설정
GET    /api/settings/eval-mode          전사 기본 평가 방식 조회
POST   /api/settings/eval-mode          전사 기본 평가 방식 변경 (admin+)
GET    /api/settings/dashboard-depth    대시보드 계층 조회
POST   /api/settings/dashboard-depth    대시보드 계층 설정 (admin+)
GET    /api/settings/session-policy     세션 정책 조회
POST   /api/settings/session-policy     세션 정책 설정 (master)

GET    /api/notice                      공지사항 조회 (인증 불필요)
POST   /api/notice                      공지사항 수정 (admin+)

GET    /api/okr                         내 OKR 목록
POST   /api/okr                         OKR 생성
POST   /api/okr/:id/progress            OKR 달성률 업데이트

GET    /api/perf/my-summary             내 성과 요약
GET    /api/perf/team-summary           팀 성과 요약 (조직장)
POST   /api/perf/ai-summary             AI 성과 요약 생성

GET    /api/admin/eval-status           전직원 평가 현황
POST   /api/admin/eval/:evalId/force-phase  평가 단계 강제 변경 (admin+)
GET    /api/admin/audit                 감사 로그 200건 (admin+)
POST   /api/admin/final/:id/unlock      최종 평가 잠금 해제 (master)
```

---

## 핵심 설계 원칙

1. **조직도 = 승인 체계**: manager_id 재귀로 N단계 자동 결정
2. **최종 평가 잠금**: master/admin만 해제 가능
3. **데이터 암호화**: 목표명/KPI/피드백/의견 AES-256-CBC
4. **권한 UI 분리**: 관리자 탭 user에게 완전 숨김
5. **Pages 객체 초기화**: `var Pages = window.Pages || {}` — app.js 최상단에서 먼저 생성, login.js 이후에도 속성 보존
6. **평가방식 3차원 매핑**: 조직(org_id) × 시기(period) × 방식(MBO/OKR/KPI)
   - 결정 우선순위: eval_period_modes → eval_periods.eval_mode → app_settings.eval_mode
   - 관리: 관리자 설정 → 평가기간 관리 탭
7. **조직 구조**: `organizations` 테이블 (계층, leader_id nullable)
   - `users.org_id` → 소속 조직
   - 평가방식 조회: `getMyOrgLeaderChain()` — 직속 조직장 체인
8. **PC 드롭다운**: `toggleNavDD(id, event)` / `closeNavDD()` — `.nav-dd-menu.open` CSS 클래스 토글, 0.15s ddSlideDown 애니메이션
9. **모바일 햄버거**: `toggleMobileMenu()` — 전체화면 오버레이, 아코디언 maxHeight 애니메이션
10. **세션 보안** (`app_settings.session_policy` JSON):
    - `close_on_browser_close`: sessionStorage 사용
    - `timeout_minutes`: localStorage synap_expire, 1분마다 체크, 최대 8시간
11. **로그인 공지사항**: `app_settings.notice` — `GET /api/notice` 인증 불필요, 감사로그 기록
12. **성과관리 홈**: `Pages.perfHome` — 역할별 뷰(내 성과/우리팀/전체조직), AI 요약(`POST /api/perf/ai-summary`)
13. **OKR**: `Pages.okrEval(periodLabel, evalYear, mode)` + `startNewOKR()` (기간 선택 UI 포함)
14. **관리자 dirty 추적**: `_adminDirty`, `markDirty()`, `clearDirty()` — `switchAdmTab()` 에서 미저장 경고
15. **관리자 평가정책 저장 방식**: `_policyState`(임시 저장) + `setPolicyState(key, val, btn)` — 버튼 강조, `saveAllPolicy()`로 일괄 API 호출, `_policyDirty` 로 탭 이동 경고
15. **목표 작성 기간**: `renderGoalSetForm`에서 수동 기간 선택 UI 제거, `_currentPeriodLabel`/`_currentEvalYear` 전역변수로 고정
16. **반응형**: 768px(탭 스크롤), 480px(햄버거), `.pc-only`/`.mobile-only` 유틸 클래스
17. **datetime 기본값 처리** (2026-05-14, PROMPT_36-7):
    - schema.prisma에서 `@default("datetime('now')")` 사용 금지
    - 이유: Prisma는 이를 문자열 기본값으로 인식 (SQL 함수 호출 아님)
    - 해결: 해당 어노테이션 제거 → SQLite의 컬럼 DEFAULT가 자동 처리
    - PostgreSQL 전환 시 `DateTime? @default(now())` 형태로 재정의 예정
18. **Repository Pattern 적용** (2026-05-14, PROMPT_36-4):
    - DB 호출은 `server/repositories/`의 인터페이스를 통해
    - 실제 구현은 `server/adapters/{어댑터}/`에 위치
    - 환경변수 `DATA_ADAPTER`로 어댑터 선택 (기본: prisma)
    - force-phase, unlock 라우터 전환 완료 (EvalCycle.updatePhaseAndLocked, FinalEvaluation.resetForUnlock 추가) (PROMPT 44-B)
    - ProgressReport Repository 추가 (content 암호화, files Aggregate Root, 트랜잭션, 라우터 3개 전환) (PROMPT 45)
    - 새 DB 지원 시 어댑터 추가만 하면 됨 (인터페이스/라우터 변경 불필요)
    - 향후 멀티테넌시 도입 시 메서드 시그니처에 `tenantId` 추가
    - Prisma의 camelCase 응답을 기존 snake_case로 자동 변환 (toSnakeCase 헬퍼)
19. **Goal 트랜잭션 일괄 교체** (2026-05-18, PROMPT_41):
    - `goalRepo.replaceByEvalId(evalId, goals)` — Prisma `$transaction` 내 DELETE + 순차 create
    - `goalRepo.updateStatusByEvalId(evalId, status)` — reopen/submit 시 goals 상태 일괄 변경
    - category 관계 `include`로 `cat_name`, `color`, `text_color` 평탄화 (`_flatten()`)

---

## 알려진 버그 및 미완성

### 🟡 알려진 클라이언트 UI 버그 (별도 처리 예정)
- 관리자 페이지 > 카테고리 관리: 삭제 버튼이 DELETE API를 호출하지 않음
  - 화면에서는 즉시 제거되지만 DB는 그대로
  - 저장 버튼은 PUT만 호출하여 삭제 명령 누락
  - PROMPT 36-9 이후 admin.js 수정 예정

### 🟡 미완성 기능
- [ ] 비밀번호 변경 기능
- [ ] 동일 기간 중복 평가 방지
- [ ] 평가 결과 Excel/PDF 출력
- [ ] 이메일 알림
- [ ] KPI 평가방식 상세 구현
- [ ] 성과관리 전체 조직 뷰 (admin용)

### 🟢 운영 서버 전환 시 필수
- [x] ENC_SECRET, JWT_SECRET → .env 분리 ✅ 2026-05-13
- [x] LLM_API_KEY → .env 분리 ✅ 2026-05-13 (사내 Synap LLM으로 전환)
- [ ] AES-256-CBC → AES-256-GCM
- [ ] SQLite → PostgreSQL
- [ ] HTTPS 적용

---

## 최근 개발 이력 (최근 30건)

| 날짜 | 작업 내용 | 작업자 |
|------|-----------|--------|
| 2026-05-20 | SQLite journal_mode 환경변수 분기 (로컬 WAL, Docker DELETE) (PROMPT 47) | Claude Code |
| 2026-05-20 | PostgreSQL 호환 schema 설계 (schema.postgresql.prisma 신규, 20개 모델, FK 관계 명시, INFRA-2A-1) (PROMPT 46) | Claude Code |
| 2026-05-20 | ProgressReport Repository 어댑터 (content 암호화, files Aggregate Root, 트랜잭션, 라우터 3개 전환) (PROMPT 45) | Claude Code |
| 2026-05-20 | force-phase, unlock 라우터 Repository 전환 (EvalCycle.updatePhaseAndLocked, FinalEvaluation.resetForUnlock 추가) (PROMPT 44-B) | Claude Code |
| 2026-05-20 | 승인 이력 화면에 목표 내용 항상 표시 (final_eval 없어도 표시, KPI/가중치 추가) (BUG-2-FIX) | Claude Code |
| 2026-05-20 | "내 승인 이력" 자기평가 완료 배지 표시 버그 수정 (score 기반 판정) (BUG-2) | Claude Code |
| 2026-05-20 | 자기 최종평가 사이클 선택 드롭다운 표시 버그 수정 (picker를 외부로 이동) (BUG-1-FIX) | Claude Code |
| 2026-05-20 | 자기 최종평가 화면 다중 사이클 지원 (find→filter+드롭다운) (BUG-1) | Claude Code |
| 2026-05-20 | FinalEvaluation Repository 어댑터 (Aggregate Root, 암호화 3개, 점수 계산, 2차 평가 분기) (PROMPT_44) | Claude Code |
| 2026-05-20 | Feedback Repository 어댑터 (Aggregate Root: feedbacks+feedback_items, 암호화 3개 필드) (PROMPT_43) | Claude Code |
| 2026-05-20 | 피드백 화면 중간 보고 전체 표시 UI 버그 수정 (80자 제한 해제, 줄바꿈 보존, XSS 방지) (PROMPT_42) | Claude Code |
| 2026-05-18 | Goal Repository Pattern 적용 (암호화 2개 필드, 트랜잭션 일괄 저장, reopen/submit 이관) (PROMPT_41) | Claude Code |
| 2026-05-18 | Docker 환경 도입 (Dockerfile, docker-compose.yml, .dockerignore, DB_PATH 환경변수화) (PROMPT_INFRA-1) | Claude Code |
| 2026-05-18 | EvalCycle Repository 어댑터 + 라우터 4개 전환 (암호화 자동 처리, isInApproverChain 도입) (PROMPT_40-A) | Claude Code |
| 2026-05-18 | Prisma explicit relation 추가 + $queryRaw → include 전환 (PROMPT_38-followup) | Claude Code |
| 2026-05-14 | Organization Repository 어댑터 + 라우터 5개 전환 (자기참조 관계 도입) (PROMPT_38) | Claude Code |
| 2026-05-14 | 목표 카테고리 삭제 UI 버그 수정 (일괄 저장 방식, _deletedCatIds 추적) (PROMPT_37) | Claude Code |
| 2026-05-14 | GradeCriteria Repository 어댑터 + /api/grade-criteria 라우터 4개 전환 (PROMPT_36-8) | Claude Code |
| 2026-05-14 | schema.prisma의 datetime default 정리 + GoalCategory id=4 정리 (PROMPT_36-7) | Claude Code |
| 2026-05-14 | GoalCategory 어댑터 + /api/categories 4개 라우터 전환 (PROMPT_36-6) | Claude Code |
| 2026-05-14 | Prisma 7→5 다운그레이드 반영, 문서 정합성 정리 (PROMPT_36-5) | Claude Code |
| 2026-05-14 | Repository Pattern 골격 + User 어댑터 + /api/auth/me 라우터 전환 (PROMPT_36-4) | Claude Code |
| 2026-05-14 | DB 스키마 정합성 정리 (eval_approval_history 제거, 컬럼 정정, AppSetting Prisma 사용 가능) (PROMPT_36-2) | Claude Code |
| 2026-05-14 | Prisma ORM 도입 (schema.prisma 정의, DB 연결 확인, 20개 테이블) (PROMPT_36-1) | Claude Code |
| 2026-05-14 | "제품화 마케팅 포인트" 섹션 신규 추가 (PROMPT_36-3) | Claude Code |
| 2026-05-13 | CLAUDE.md Git 자동 커밋 규칙 추가, AI 요약 UI 줄바꿈 수정, 디버깅 로그 제거 (PROMPT_35) | Claude Code |
| 2026-05-13 | 사내 LLM(Synap) 연동, .env 분리, JWT/ENC_SECRET/LLM_API_KEY 환경변수화 (PROMPT_34) | Claude Code |
| 2026-05-13 | 실행.bat 완전 정리 (한글깨짐/ngrok 잔여코드 제거, UTF-8 BOM 없이 저장) | Claude Code |
| 2026-05-13 | 실행.bat ngrok 변경사항 롤백 (서버만 실행, ngrok는 별도 수동 실행) | Claude Code |
| 2026-05-13 | 실행.bat ngrok 자동 실행 수정 (백그라운드 실행 + 주소 자동 조회) | Claude Code |
| 2026-05-13 | 관리자 탭 2줄 표시 (평가관리 / 조직권한로그), data-tab 기반 active 처리 | Claude Code |
| 2026-05-13 | 관리자 탭 스크롤바 숨김 + 우측 페이드아웃 효과 추가 | Claude Code |
| 2026-05-13 | 관리자 탭 스크롤바 표시, 상하폭 조정, 잘림 현상 수정 (.adm-tabs/.adm-tab 신규 적용) | Claude Code |
| 2026-05-13 | 관리자 탭 언더라인+가로스크롤, 탭 순서 변경, 저장버튼 흰색 | Claude Code |
| 2026-05-13 | 평가정책 저장버튼 우측상단 배치, 조직도 캔버스 높이 제한 및 버튼 위치 수정 | Claude Code |
| 2026-05-13 | OKR 기간 선택 반기/분기 표시, 평가정책 저장하기 방식 근본 수정 (즉시반영→저장버튼) | Claude Code |
| 2026-05-13 | OKR 기간 선택 UI, 관리자 저장하기 방식 변경, CLAUDE.md 분리 | Claude Code |
| 2026-05-13 | PC 관리자 드롭다운 전체 메뉴 추가 (섹션 구분, 실제 탭ID로 수정) | Claude Code |
| 2026-05-13 | 목표작성 기간 선택 UI 숨김, eval_periods 삭제 시 eval_period_modes 함께 삭제 | Claude Code |
| 2026-05-13 | 드롭다운 텍스트 표시 수정, 모바일 아코디언 애니메이션 추가 | Claude Code |
| 2026-05-13 | PC 헤더 메뉴 수평 중앙 정렬 (nav topbar 내부 이동, position absolute 중앙) | Claude Code |
| 2026-05-13 | 드롭다운 메뉴 z-index 및 배경색 수정 | Claude Code |
| 2026-05-13 | PC 메뉴 미표시 + 모바일 첫화면 공백 수정 (login API.setToken 순서 수정) | Claude Code |
| 2026-05-13 | Pages 초기화 순서 버그 수정 (var Pages=window.Pages||{} 상단 추가) | Claude Code |
| 2026-05-12 | 성과관리 홈 대시보드 (역할별 뷰, AI 요약, 계층 설정) | Claude Code |

---

## 제품화 마케팅 포인트 (Product Selling Points)

> 개발 과정에서 누적된 제품 차별화 요소.
> 추후 "제품 소개자료/설명서/기술스택 자료를 만들어줘" 같은 명령에 활용.
> 신규 기능 추가 시 해당하는 항목을 본 섹션에 누적 기록.

### 🏗️ 기술 스택 차별화

- [x] **멀티 DB 지원 아키텍처** — Prisma ORM 5.x + Repository Pattern 적용 (User, GoalCategory 어댑터 완료)
  - 추가 어댑터(PostgreSQL/MySQL/MSSQL/Oracle 등) 확장 가능
  - 환경변수 한 줄(DATA_ADAPTER)로 어댑터 전환
  - CRUD 패턴 검증 완료 (조회/생성/수정/비활성화)
- [ ] **배포 유연성** — 클라우드 SaaS / 전용 인스턴스 / 온프레미스 모두 지원
  - Docker 컨테이너 기반 배포 (예정)
  - 고객사 자체 서버 설치 옵션 지원 (예정)
- [x] **AI 성과 요약** — LLM 종류 선택 가능 (제공자 중립)
  - OpenAI 호환 API 형식 표준 사용
  - 사내 LLM, 외부 LLM, 클라우드 LLM 모두 연동 가능
  - 환경변수로 엔드포인트/모델 선택

### 🔒 보안

- [x] **AES-256-CBC 필드 단위 암호화**
  - 목표명, KPI, 피드백, 의견 등 민감 데이터 자동 암호화
  - 추후 AES-256-GCM으로 업그레이드 예정
- [x] **JWT 인증 + 세션 보안 정책**
  - JWT 8시간 만료
  - 브라우저 종료 시 자동 로그아웃 설정 가능
  - 세션 타임아웃 분 단위 설정 가능
- [x] **감사 로그 자동 기록**
  - 모든 주요 변경(승인, 반려, 평가 제출 등) 자동 기록
  - 사용자, 시각, IP, 변경 내용 보존
- [x] **권한 3단계 분리**
  - master (최고관리자) / admin (관리자) / user (일반)
  - UI 자체에서 권한별 메뉴 분리 (관리자 메뉴는 user에게 완전 숨김)
- [x] **민감 정보 환경변수 분리**
  - API 키, JWT 시크릿, 암호화 키 모두 .env 분리
  - GitHub 등 코드 저장소에 비밀 노출 방지 (.gitignore 적용)

### 📊 평가 방식 유연성

- [x] **다중 평가 방식 지원**
  - MBO (목표관리)
  - OKR (목표·핵심결과)
  - KPI (핵심성과지표)
- [x] **평가 방식 3차원 매핑**
  - 조직(부서) × 시기(분기/반기) × 평가방식
  - 부서별 다른 평가 방식 운영 가능
- [x] **조직도 기반 자동 승인 워크플로우**
  - manager_id 재귀 탐색으로 N단계 승인 체인 자동 결정
  - 별도 승인 정책 설정 없이 조직도만 변경하면 즉시 반영
- [x] **2차 최종평가 옵션**
  - 1차 평가자 + 2차 평가자 순차 평가 지원
  - 관리자가 활성/비활성 토글 가능
- [x] **등급 기준 동적 관리**
  - 관리자가 등급 코드, 명칭, 설명을 직접 등록/수정
  - 회사별 등급 체계에 맞춤 가능 (S/A/B/C/D, 1/2/3/4/5 등)

### 🛠️ 운영 효율성

- [x] **시간대 설정** — 글로벌 고객 대응 가능 (Asia/Seoul, UTC 등)
- [x] **로그인 공지사항** — 인증 전 표시되는 운영 메시지
- [x] **관리자 정책 설정 패널**
  - 승인 수정/취소 허용 여부
  - 이력 공개 정책
  - 피드백 횟수 제한
  - 비활성 기간 이력 공개 여부
- [x] **목표 카테고리 동적 관리** — 회사별 평가 카테고리 자유 설정
- [x] **조직도 시각 편집** — 드래그앤드롭으로 조직도 편집

### 📱 사용자 경험

- [x] **반응형 UI** — PC/태블릿/모바일 모두 지원
- [x] **단일 페이지 애플리케이션(SPA)** — 페이지 전환 없는 부드러운 동작
- [x] **빌드 과정 없음** — 별도 컴파일 없이 즉시 실행 가능 (Vanilla JS)
- [x] **즉시 실행** — Node.js만 설치되어 있으면 한 번 명령으로 가동

### 🔮 향후 추가 예정

- [ ] **역량 평가 (Phase 2)** — 직무별 역량 항목 동적 등록, 척도 선택 가능
- [ ] **다면 평가 (Phase 2)** — 360도 평가, 익명성 정책 설정 가능
- [ ] **멀티테넌시** — 한 서버에서 여러 고객사 동시 운영 (B2B SaaS 핵심)
- [ ] **결제/구독 관리** — Stripe 등 결제 연동, 플랜별 기능 제한
- [ ] **REST API 공개** — 고객사 자체 인프라와 연동 가능
- [ ] **AES-256-GCM 업그레이드** — 인증 태그가 있는 더 강력한 암호화
- [ ] **이메일 알림** — 승인 대기, 피드백 도착 등 자동 메일
- [ ] **Excel/PDF 출력** — 평가 결과 일괄 다운로드

### 💡 개발 효율성 (내부 자랑거리)

- **AI 협업 개발 방식**
  - Claude.ai (설계/디버깅) + Claude Code (실행) 조합
  - 비개발자(CFO 겸 인사팀장) 단독 개발
  - "AI는 How, 사람은 What" 원칙 적용
- **개발 속도**
  - Phase 1 (MBO 평가, 17개 테이블, API 70+, SPA 10페이지+): 약 14일
  - 일반 SI 환산: 17 MM, 1.5~2.2억 원 견적
  - 실제 비용: AI 구독료 수준 (99% 절감)
- **외부 두뇌 시스템**
  - CLAUDE.md + ClaudeHRM.md로 AI 컨텍스트 관리
  - 작업별 PROMPT 파일로 작업 이력 추적 (35+ 개 누적)
  - Git 자동 커밋 규칙으로 본인은 push만 실행
- **검증 자동화 친화**
  - 모든 작업 후 사용자 직접 검증 단계 포함
  - 디버그 로그 자동 정리 패턴
  - 안전한 브랜치 전략 (feat/* 브랜치 + 안정 태그)

---

## 마케팅 포인트 운영 가이드

### 누가 업데이트하나
- **Claude**: 새 기능 작업 시 해당 항목을 본 섹션에 추가하거나 [ ] → [x] 변경
- **사용자**: 비개발 측면(영업/마케팅) 인사이트 추가, 우선순위 조정

### 언제 활용하나
- 제품 소개자료 작성 시
- 영업 자료 (PT, 제안서) 작성 시
- 기술 스택 설명 시 (개발자 채용, 외부 기술 컨퍼런스 발표 등)
- 투자 유치 자료 (IR) 작성 시
- 가격 정책 설계 시 (어떤 기능이 프리미엄 가치를 가지는지 판단)

### 명령 예시 (향후 사용)
- "마케팅 포인트 섹션 기반으로 1페이지 제품 소개서 만들어줘"
- "기술 스택 차별화 항목으로 영업 PT 슬라이드 5장 작성"
- "Phase 2 완성 후 마케팅 포인트 섹션 최신화해줘"

---

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
| 2026-05-12 | PC 드롭다운 슬라이드 애니, 성과관리 메뉴, 세션 보안 정책 추가 | Claude Code |
| 2026-05-12 | organizations 테이블 추가, org_id 기반 평가방식 조회, 조직 관리 탭 추가 | Claude Code |
| 2026-05-12 | 반응형 UI 추가 (모바일 햄버거 메뉴, 768px/480px 미디어쿼리) | Claude Code |
| 2026-05-12 | 평가방식 3차원 매핑 (조직×기간×방식), eval_period_modes 테이블 | Claude Code |
| 2026-05-12 | 로그인 공지사항 기능 추가 (DB마이그레이션, 감사로그) | Claude Code |
| 2026-05-12 | OKR 평가방식 기간별 분기 (OKR/KPI기간→OKR버튼) | Claude Code |
| 2026-05-11 | 시스템 시간대 설정 기능 추가 (app_settings 기반) | Claude Code |
| 2026-05-08 | 2차 최종평가 기능 완성 | Claude Code |
| 2026-05-04 | 최종평가 등급선택 카드테이블, 평가기간 관리, 2차 최종평가 설정 | Claude Code |
| 2026-05-01 | 피드백 열람 권한, 조직도 차트, 승인 이력 | Claude Code |
| 2026-04-30 | Claude Code 버그 수정 v1.1 (cancelApproval, manager_id null 등) | Claude Code |
