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
├── scripts/
│   ├── seed-eval-data.js        ← 시드 데이터 생성 (8명×9분기, AI 분석 검증용, weight=카테고리 내 비중, final_score 0-100)
│   ├── recalc-final-scores.js   ← 운영 데이터 final_score 재계산 (PROMPT 61B)
│   └── migrate-grade-policy.js  ← 등급 정책 마이그레이션 (PROMPT 63A, grade_criteria→grade_policies, 자동 백업)
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
| DATABASE_URL | DB 연결 문자열 (Prisma) | 로컬: file:../data/hrmanage.db / Docker: file:/app/data/hrmanage.db |
| DATA_ADAPTER | DB 어댑터 선택 | prisma |
| SQLITE_JOURNAL_MODE | SQLite journal mode (로컬은 WAL, Docker는 DELETE) | WAL |

**Docker 환경 주의**: docker-compose가 호스트의 `.env`를 `env_file` 지시어로 컨테이너에 주입.
`.env` 파일이 호스트의 docker-compose.yml과 같은 디렉토리에 있어야 함. `.dockerignore`로
빌드 제외돼도 `env_file`은 별도 메커니즘이라 문제없음.

- 사용 가능 모델: SynapAssistant-MoE-30B, SynapAssistant-27B
- 응답 포맷: OpenAI 호환 (`data.choices[0].message.content`)
- 요청 시 `stream: false` 명시 필수

---

## DB 스키마

> 실제 DB 기반 (2026-05-29 PROMPT 63A 마이그레이션 후). 총 21개 사용 테이블 + 1개 시스템(sqlite_sequence).
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
                   is_active, created_by, created_at, eval_mode, locked,
                   grade_policy_id(FK→grade_policies.id)
eval_period_modes  id, period_id, manager_id, eval_mode, locked, created_at
                   UNIQUE(period_id, manager_id)
audit_logs         id, user_id, action, ip, created_at,
                   target_id, target_name, detail
grade_policies     id, name(UNIQUE), description, created_at, created_by
grade_policy_criteria  id, policy_id(FK→grade_policies.id ON DELETE CASCADE),
                   grade_code, grade_name, min_score(REAL 0-100), sort_order,
                   description, note, created_at
                   UNIQUE(policy_id, grade_code), UNIQUE(policy_id, sort_order)
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
POST   /api/auth/change-password        본인 비밀번호 변경

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

GET    /api/eval-periods                평가 기간 목록 (?year_from,?year_to — 최근 2개년 기본, 최대 10년)
GET    /api/eval-periods/active         활성 기간
GET    /api/eval-periods/available-years  평가 기간 데이터 존재 연도 목록 (?include_inactive, admin+)
GET    /api/eval-periods/my-modes       활성 기간별 내 평가방식
POST   /api/eval-periods                기간 추가 (admin+, grade_policy_id 필수)
PATCH  /api/eval-periods/:id            기간 수정 (admin+, grade_policy_id 변경 시 activation_blocked_at NULL 클리어)
PATCH  /api/eval-periods/:id/toggle     활성/비활성 토글 (admin+, grade_policy_id 없으면 활성화 불가 — 400 + activation_blocked_at 기록)
DELETE /api/eval-periods/:id            기간 삭제 (master, eval_period_modes도 삭제)
GET    /api/eval-periods/missing-policy 미바인딩+차단이력 기간 목록 (admin+)
GET    /api/eval-periods/:id/eval-mode  기간 전사 기본방식 조회 (admin+)
POST   /api/eval-periods/:id/eval-mode  기간 전사 기본방식 설정 (admin+)
GET    /api/eval-periods/:id/org-modes  기간 조직별 방식 조회 (admin+)
POST   /api/eval-periods/:id/org-modes  기간 조직별 방식 설정 (admin+)
POST   /api/eval-periods/:id/lock       기간 방식 잠금 (admin+)

GET    /api/grade-criteria              [410 Gone] 폐기 — GET /api/grade-policies 로 대체
POST   /api/grade-criteria              [410 Gone] 폐기
PUT    /api/grade-criteria/:id          [410 Gone] 폐기
DELETE /api/grade-criteria/:id          [410 Gone] 폐기

GET    /api/grade-policies              등급 정책 목록 + criteria[] + applied_periods[] (admin+)
POST   /api/grade-policies              정책 신규 생성 (admin+, name 중복→409, criteria 검증 필수)
PUT    /api/grade-policies/:id          정책 수정 (admin+, criteria 변경은 applied_periods 0개일 때만→409)
DELETE /api/grade-policies/:id          정책 삭제 (admin+, applied_periods는 NULL 초기화+비활성화)

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
GET    /api/perf/org-tree               전체 조직 트리 + 통계 (권한별, 최대 8기간, ?include_inactive)
GET    /api/perf/quarterly-trend        분기별 평균 추이 (최대 8기간, ?include_inactive)
GET    /api/perf/grade-distribution     등급 분포 시계열 (히트맵용, 최대 8기간, ?include_inactive)
POST   /api/perf/org-ai-summary         전체 조직 AI 요약 (사내 LLM, ORG_AI_SUMMARY_GENERATED 감사, level=summary|detailed|comprehensive, include_inactive)

GET    /api/admin/eval-status           전직원 평가 현황 (?period_ids,?include_inactive — users with cycles array)
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
12. **성과관리 홈**: `Pages.perfHome` — 역할별 뷰(내 성과/우리팀/전체조직 분석), AI 요약(`POST /api/perf/ai-summary`, `POST /api/perf/org-ai-summary`), 전체 조직 분석은 master/admin/조직장만 접근, 최대 8기간 추이 + Chart.js 라인/바/히트맵 토글
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
20. **개인정보 보호 원칙** (2026-05-22, PROMPT 52): 모든 PROMPT 작업 시 `HRPRIVACY_PRINCIPLES.md`의 점검 체크리스트 통과 필수. 위반 우려 시 작업 중단 + 사용자(대표) 협의.
21. **목표 입력 검증** (2026-05-27 PROMPT 58D → 2026-05-28 PROMPT 61A 보강): 평가 제출(`/api/evals/:id/submit`) 및 1차 승인(`/api/approvals/:evalId/approve`) 시 `validateEvalGoals(evalId)` 헬퍼로 검증. 규칙: 활성 카테고리당 목표 ≥ 1개, 카테고리별 가중치 합 = 100 (오차 ±0.01, **카테고리 내 비중 의미**), name 필수, weight > 0. kpi는 선택적 (정성 목표 허용).
22. **평가 방식별 운영 정책** (2026-05-27, PROMPT 60):
    - **MBO** (Management by Objectives): 현재 운영 가능. draft → submit → pending → approved → final_done 워크플로우. PROMPT 58D 목표 검증 적용 (개수≥1, 가중치합=100±0.01, name 필수, weight>0).
    - **OKR** (Objectives and Key Results): 운영 관리 도구로만 동작 (저장·진행률 추적). 평가 점수 미통합, 승인 워크플로우 없음. `okr_key_results.weight` 컬럼은 미사용. 향후 Phase 2 재검토 (개발 백로그 BL-001).
    - **KPI** (Key Performance Indicator): 미구현. 향후 Phase 2 재검토 (개발 백로그 BL-002).
    - 평가 방식 3차원 매핑(조직 × 시기 × 방식) 아키텍처는 구현됨. 단 실제 운영 가능한 방식은 MBO만.

23. **UI 일관성 원칙** (2026-05-27, PROMPT 60D):
    - 신규 UI 작업 시 시스템 전반에 이미 사용 중인 패턴(색상·여백·구분선·이모지 사용 등) 우선 식별 후 그대로 적용
    - 새 색상·스타일 발명 금지 (명확한 사용자 요구 시 예외)
    - 강조 색상: 오렌지(#d97706), 옅은 주황 그라데이션(linear-gradient with rgba(217,119,6,0.3))은 섹션 구분에 사용
    - 모든 UI 작업 PROMPT의 사전 점검 단계에 기존 CSS 패턴 검색 포함
    - 협업 시 메타 원칙은 CLAUDE.md 참조

25. **조직 평균 산출** (2026-05-28, PROMPT 62):
    - 조직(회사/본부/팀) 평균 = 개인별 `final_score`(0-100) 직접 평균 (등급 이산화 경로 제거)
    - 사유: `selected_grade→codeToScore(1-6)` 경로는 등급 경계에서 ±10점대 왜곡 발생
    - 등급 분포 통계(grade-distribution)와 개인 등급 라벨은 유지 — 평균 계산에서만 등급 경로 제외
    - 내부 계산 4자리 정밀(`Math.round(sum/cnt*10000)/10000`), 화면 표시 100점 만점 소수점 2자리
    - NC(평가 제외)는 평균에서 제외 유지
    - `GET /api/perf/org-tree`, `GET /api/perf/quarterly-trend` 모두 `avg_score` 0-100 스케일 반환

26. **등급 정책 시점별 바인딩** (2026-05-29, PROMPT 63A):
    - `eval_periods.grade_policy_id` FK → `grade_policies` → `grade_policy_criteria` 테이블
    - 기간별 독립 등급 기준 — 연도/시기가 달라도 기준이 다를 수 있음
    - `scoreToGrade(score, criteria)`: min_score DESC 정렬 criteria 반복, 첫 충족 등급 반환 (단일 구현)
    - `getPolicyForEval(evalId)`: eval_cycles↔eval_periods 조인(period_label+eval_year), 정책+criteria 반환
    - `getDefaultPolicyId()`: grade_policies 첫 행 (id ASC) — fallback용
    - `buildGradeMap(policyId)`: 통계 라우터용, policyId null 시 default 사용
    - IR min_score=0 필수 (catch-all) — 미충족 score가 null 반환되면 평가 완료 불가
    - 활성화 게이트: grade_policy_id 없는 기간 활성화 시 400 오류
    - S/A/B/C/D 하드코딩 제거 — 6등급 OI/EE/SC/ME/PB/IR 전환 (grade_code 기반 유연)
    - grade_criteria 테이블 폐기 (DROP), grade-criteria 4개 API 410 Gone 반환
    - 디폴트 정책 "사이냅 표준안": OI≥90, EE≥80, SC≥70, ME≥60, PB≥50, IR≥0
    - 정책 수정 잠금: applied_periods ≥ 1인 정책은 criteria(cutoff) 수정 불가 (409), 이름·description은 항상 수정 가능
    - 정책 삭제: applied_periods의 grade_policy_id NULL + is_active=0 강제 초기화, audit_log 기록
    - 검증 규칙: criteria 최소 1건, min_score 0~100, sort_order 오름차순 → min_score 단조감소, grade_code·min_score·sort_order 중복 불가
    - audit_log 액션: GRADE_POLICY_CREATED / GRADE_POLICY_UPDATED / GRADE_POLICY_CRITERIA_UPDATED / GRADE_POLICY_DELETED / EVAL_PERIOD_POLICY_DETACHED
    - UI: 등급 정책 관리 탭(카드형 펼침), 평가 기간 폼 정책 드롭다운, 미바인딩 알림 배너(상단 고정, "즉시 해결" 버튼)
    - 미바인딩 알림 표시 조건: grade_policy_id IS NULL AND activation_blocked_at IS NOT NULL
    - DB: eval_periods.activation_blocked_at 컬럼 — PATCH toggle 차단 시 기록, 정책 바인딩 시 클리어
    - audit_log 추가: EVAL_PERIOD_ACTIVATION_BLOCKED (미바인딩 기간 활성화 차단), EVAL_PERIOD_UPDATED (기간 수정)

28. **분석 환산 옵션** (2026-06-01, PROMPT 63D):
    - 저장된 final_grade는 영구 보존 — 산출 시점 정책 기준 단일 진실
    - 분석 시 "현재 cutoff 기준 환산" 토글 제공 — 가상 산출, DB 저장 없음
    - 환산 기준 정책: 드롭다운으로 임의 선택 (현재 활성 / 과거 정책 모두 포함)
    - 디폴트 환산 기준: 가장 최근 활성 기간의 정책
    - 차이 시각화: 저장값 ≠ 환산값이면 취소선 + 주황 → 표시
    - 환율 원칙: 과거 거래 금액은 불변, 분석 시 환산 옵션 제공
    - `GET /api/perf/employee-grades`: 직원별 final_score/grade + available_policies (criteria) + active_policy_id
    - `convertGradeWithPolicy(score, policyId)` 서버 헬퍼, `convertGradeClient(score, criteria)` 클라이언트 헬퍼
    - 전체 조직 분석 화면 컨트롤 영역에 토글+드롭다운 추가, `onConvToggle()` / `refreshConvTable()` 핸들러

30. **보고·피드백 통합 UI** (2026-06-01, PROMPT 64B):
    - 부하 화면: "중간 보고" + "중간 피드백" → "보고·피드백" 단일 메뉴로 통합 (성과관리 드롭다운)
    - `public/js/pages/my-report-feedback.js` 신규 — `Pages.myReportFeedback`
    - 목표별 카드 N개 + 종합 카드: 각 카드 안에 보고(노랑)+피드백(파랑) 회차 시간순 인터리브
    - 회차 펼치기: 기본 최신 3회차, "이전 회차 더보기" 3건씩 점진 노출 (`showMoreRounds`)
    - 레거시 보고 (goal_id NULL, 1,510건): `parseLegacyReports`로 [목표명] 마커 파싱, 매칭 실패 시 종합 분류
    - 보고 작성: `submitRFReport` — items/overall 형식으로 64A 라우터에 전송
    - 상사 피드백 작성 화면: 부하 보고 raw text → 목표별 최신 보고 1건씩 구조화 표시
    - lazy 로딩: 첫 pane만 즉시 렌더, 탭 클릭 시 해당 pane lazy 렌더
    - CSS: .goal-report-card, .round-block, .item-block, .report-block, .feedback-block, .bd-legacy, .summary-card

29. **목표별 보고/피드백 연동** (2026-06-01, PROMPT 64A):
    - `progress_reports`에 `goal_id INTEGER NULL` + `round INTEGER DEFAULT 1` 컬럼 추가
    - `goal_id=NULL` = 종합 의견 또는 레거시(기존 1,510행) 보존, `goal_id IS NOT NULL` = 목표별 보고
    - `POST /api/reports/:evalId`: `items` 배열(신규) 또는 `content` 문자열(레거시 호환) 수신, 회차 자동 산출
    - `GET /api/reports/:evalId`: `goal_id`, `round`, `goal_name`(복호화) 포함 — 클라이언트 그룹화 가능
    - 회차 제한: `app_settings.feedback_limit` — 보고·피드백 양쪽 POST 라우터에서 강제 (64-PRE §6 버그 해결)
    - 기존 1,510행은 `goal_id=NULL, round=1` 레거시로 보존 (재분류 없음)
    - 시드: 목표별 `goal_id` + `round` 포함 INSERT, 종합 의견(NULL) 별도 행
    - 마이그레이션: `scripts/migrate-progress-report-goals.js` (자동 백업 + idempotent)
    - UI 통합은 PROMPT 64B 별도 작업

27. **최종 등급 무결성 원칙** (2026-06-01, PROMPT 63D-FIX):
    - 최종 등급은 `scoreToGrade(final_score, period.policy.criteria)` 자동 산출값만 인정
    - 평가자(1차/2차)·관리자 모두 등급 수동 선택·덮어쓰기 불가
    - `final_grade = selected_grade = scoreToGrade(finalScore, ...)` 항상 동일 보장
    - 클라이언트가 `selected_grade` 전송 시 서버에서 무시 + `console.warn` 경고 로그 기록
    - `selected_grade` 컬럼 보존 (시스템 전반 6곳 사용처) — `final_grade`와 항상 동일 값
    - `final-eval.js`에서 "최종 등급 선택 *" 카드 UI 제거, 자동 산출 안내 문구로 교체
    - INTEGRITY-1 가드: server/index.js POST /api/final/:evalId/mgr에 선택 차단 적용
    - 사용자 무결성 원칙 (2026-06-01): "평가자가 항목별 평가치를 무시하고 최종 등급을 줄 수 있다는 건 수용 불가"

24. **점수 계산 공식** (2026-05-28, PROMPT 61A):
    - 공식: `final_score = Σ(카테고리 가중치/100 × Σ(목표 점수/5×100 × 카테고리 내 weight/100))`
    - 헬퍼: `calcFinalScore(evalId, scoreField)` (scoreField: mgr_score | self_score | second_mgr_score)
    - 0-100 스케일, 소수점 2자리 반올림 (표시 시 Math.round × 10 / 10)
    - 부분 평가 시 평가된 카테고리 가중치 합으로 정규화 (usedCatW < 100)
    - 등급 매핑: 90+:S, 80+:A, 70+:B, 60+:C, else:D
    - `goal_categories.weight`(50/30/20)와 `goals.weight`(카테고리 내 100%)는 의미가 다름에 주의

---

## 알려진 버그 및 미완성

### 🟡 알려진 클라이언트 UI 버그 (별도 처리 예정)
- 관리자 페이지 > 카테고리 관리: 삭제 버튼이 DELETE API를 호출하지 않음
  - 화면에서는 즉시 제거되지만 DB는 그대로
  - 저장 버튼은 PUT만 호출하여 삭제 명령 누락
  - PROMPT 36-9 이후 admin.js 수정 예정

### 🟡 미완성 기능
- [ ] 비밀번호 변경 기능 (INFRA-3 범위로 이관, 2026-05-20)
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

## 개발 백로그 (Phase 2 검토 사항)

> 단계 1(사이냅 자체 운영) 안정화 이후 외부 영업 시점 재검토 사항.
> 개인정보 보호 영역 이슈는 PRIVACY_ISSUES.md, 인프라 영역은 ClaudeHRM.md INFRA 섹션 참조.

### BL-001: OKR 평가 통합 (Phase 2)

**우선순위**: 외부 영업 시점 결정
**현황** (2026-05-27 분석):
- OKR이 본 시스템에서 운영 관리 도구로만 작동 (저장·진행률 추적)
- 평가 점수 산출과 미통합, 승인 워크플로우 없음
- okr_key_results.weight 컬럼이 죽은 코드 (DEFAULT 33 고정, UI 없음)
- eval_cycles(MBO)와 okr_cycles(OKR)는 완전히 별도 테이블

**Phase 1 결정 (현재)**: OKR은 운영 도구로 유지, 평가 시스템과 분리

**Phase 2 재검토 옵션** (외부 영업 직전):
- A: 현재 상태 유지 (OKR은 운영 도구로만, 마케팅 표현 정확화)
- B: 평가 통합 (KR 가중치 모델 + 점수 산출 + 승인 워크플로우 추가, 약 2~3주)
- C: OKR 기능 완전 제거 (MBO·KPI만 지원)

**Phase 2 결정 시 고려 사항**:
- KR 가중치 모델: 단순 모드(균등 비중) vs 정밀 모드(개별 가중치)
- 평가 점수 산출 로직: Objective 평균 vs 가중치 환산
- 승인 워크플로우 적용 여부

### BL-002: KPI 평가 방식 상세 구현 (Phase 2)

**우선순위**: 외부 영업 시점 결정
**현황**: ClaudeHRM.md "미완성 기능" 목록에 명시
- 시스템 구조상 평가 방식 3차원 매핑은 가능 (조직 × 시기 × 방식)
- KPI 전용 입력/검증/점수 로직 미구현

**Phase 2 작업 범위**:
- KPI 항목 정의 (조직별 KPI 카탈로그)
- 가중치·목표값·실적 입력 UI
- 달성률 자동 계산
- KPI 평가 모드 선택 시 화면 분기

### BL-003: 마케팅 포인트 정확화 (Phase 2)

**우선순위**: 외부 영업 직전 필수
**현황**: 본 문서 "제품화 마케팅 포인트" 섹션에 OKR/KPI 지원으로 표시
**실제 운영 가능한 평가 방식**: MBO 1개

**Phase 2 액션**:
- BL-001·BL-002 결정 후 마케팅 포인트 표현 정확하게 수정
- 영업 자료·홈페이지·제품 소개서 모두 일관성 유지

### BL-004: PC 전용 UI 최적화

**우선순위**: 운영 안정화 후 (사용자 결정 2026-05-27, 우선순위 4)
**현황**: 모든 화면이 모바일 친화적 레이아웃 + PC에서 화면 공간 낭비
**작업 범위**:
- PC 모니터 전체 활용한 컴팩트 레이아웃
- 평가 작성/분석/관리 화면 한 눈에 보기
- 반응형 분기 기준 결정 (1024px / 1280px / 1440px 중)
- 적용 화면 우선순위 결정 (평가 → 분석 → 관리)
- 디자인 참고 자료 (Notion/Linear/Jira 등)

---

## 최근 개발 이력 (최근 30건)

| 날짜 | 작업 내용 | 작업자 |
|------|-----------|--------|
| 2026-06-01 | 64B-FIX — POST 라우터 items=[] + overall 케이스 처리 + 작성 폼 분기 라벨 + 암호화 점검 스크립트 (PROMPT 64B-FIX) | Claude Code |
| 2026-06-01 | 보고·피드백 통합 UI — 목표별 카드 + 회차 펼치기 + 레거시 파서 + 메뉴 통합 (PROMPT 64B, 64 시리즈 완료) | Claude Code |
| 2026-06-01 | 목표별 보고/피드백 연동 데이터 모델 — progress_reports.goal_id/round 추가, POST/GET 라우터 재작성, 회차 제한 강제 (PROMPT 64A) | Claude Code |
| 2026-06-01 | 성과관리 홈 UI 보정 — AI 요약 영역 최상단 이동(B 흐름 안내) + 기간 드롭다운 한 줄 가로 배치 (PROMPT UI-PERF-HOME) | Claude Code |
| 2026-06-01 | 일반 사용자 로그인 401 회귀 수정 — api.js token()이 localStorage만 읽어 sessionStorage 토큰 누락 → sessionStorage도 읽도록 수정 (PROMPT LOGIN-FIX) | Claude Code |
| 2026-06-01 | 분석 환산 옵션 도입 — 성과 분석 화면에 "현재 cutoff 기준 환산" 토글 + 정책 드롭다운 + 가상 산출 (PROMPT 63D, 63 시리즈 완료) | Claude Code |
| 2026-06-01 | 최종 등급 무결성 결함 수정 — 1차/2차 평가자 selected_grade 수동 선택 차단, 자동 산출 강제 (PROMPT 63D-FIX) | Claude Code |
| 2026-06-01 | 등급 정책 관리 UI 완성 — 카드형 탭 + 모달 편집 + 평가 기간 폼 정책 드롭다운 + 미바인딩 배너 상단 고정 + activation_blocked_at 컬럼 (PROMPT 63C) | Claude Code |
| 2026-05-29 | 등급 정책 CRUD API 완성 — POST/PUT/DELETE + 검증(단조감소·범위·중복) + cutoff 잠금(applied_periods≥1) + 삭제 시 강제 초기화 + audit_log 5종 (PROMPT 63B) | Claude Code |
| 2026-05-29 | 등급 정책 시점별 바인딩 도입 — grade_policies/grade_policy_criteria 신규, scoreToGrade 단일화, S/A/B/C/D 하드코딩 제거, eval_periods 활성화 게이트, grade-criteria API 폐기 (PROMPT 63A) | Claude Code |
| 2026-05-29 | 내 평가 사이클 카드 진행 단계 표시 모바일 가로 오버플로 수정 (반응형 flex + 매우 좁은 화면 라벨 줄바꿈) (PROMPT 63-UI) | Claude Code |
| 2026-05-28 | 조직 평균 영역 대표 등급 표시 제거 — 점수만 표시 (PROMPT 62 후속) | Claude Code |
| 2026-05-28 | 조직 평균 산출 등급기반→final_score 가중평균 전환 + 100점 스케일 2자리 표시 + 체크박스 라벨 CSS (PROMPT 62) | Claude Code |
| 2026-05-28 | 시드 weight·점수 스케일 통일 + 운영 데이터 재계산 + 자동 백업 (PROMPT 61B) | Claude Code |
| 2026-05-28 | 기간 조회 범위 회귀 버그 수정 — 전체 조직 분석·평가 기간 관리 디폴트 전체 조회 복원 (PROMPT 60E) | Claude Code |
| 2026-05-28 | weight 카테고리 내 100% 통일 — 검증·점수 계산 로직 변경 (calcFinalScore 헬퍼) (PROMPT 61A) | Claude Code |
| 2026-05-28 | PROMPT 작성 원칙 명문화 — 코드 읽기 가이드·실행 트리거·컨텍스트 효율 (CLAUDE.md) | Claude Code |
| 2026-05-28 | 평가 정책 탭 모든 항목 1행 통일 (policy-item-multi 제거, grid 레이아웃) (PROMPT 60C-fix) | Claude Code |
| 2026-05-28 | 평가 기간 관리 조회 범위 UI 시각적 버그 보정 (small/btn/label 압축 방지) (PROMPT 60B-fix2) | Claude Code |
| 2026-05-27 | 평가 정책 탭 UX 개선 (4그룹화, 이모지, 1줄/2줄 카드형, 옵션 우측 정렬) (PROMPT 60C) | Claude Code |
| 2026-05-27 | 메타 원칙 명문화 — 자동 갱신·효율적 협업·UI 일관성 (CLAUDE.md + ClaudeHRM.md 23번) (PROMPT 60D) | Claude Code |
| 2026-05-27 | nodemon 도입 + 평가 기간 UI 보정(한 줄 배치, 데이터 연도만, 체크박스 한 줄) (PROMPT 60B-fix) | Claude Code |
| 2026-05-27 | 전직원 평가 현황 기간 선택 + 평가 기간 관리 접기/조회 범위 (PROMPT 60B) | Claude Code |
| 2026-05-27 | 개발 백로그 섹션 신규 + OKR 평가 정책 결정 (운영 도구로 유지, Phase 2 재검토 등록) (PROMPT 60) | Claude Code |
| 2026-05-27 | 평가완료 표시 보정(사이클 단위) + comprehensive AI 렌더링 수정 + 목표 미입력 차단 (PROMPT 58D) | Claude Code |
| 2026-05-27 | 전체 조직 AI 요약 3단계 옵션 추가 (요약10줄/상세요약30줄/상세분석50줄+, 세션 캐싱, max_tokens 분기) (PROMPT 58C) | Claude Code |
| 2026-05-27 | 전체 조직 분석 활성/비활성 기간 선택 옵션 (master/admin 전용 체크박스, 비관리자 차단 audit_log) (PROMPT 58B) | Claude Code |
| 2026-05-27 | 시드 데이터 생성 스크립트 (8명×9분기=72사이클, 64최종평가, 시나리오별 등급 분포, period_ids 기반 크로스년도 수정) (PROMPT 59) | Claude Code |
| 2026-05-27 | 전체 조직 AI 요약 + 평가 통계 (회사/본부/팀 3단계, 8기간 추이, 차트 3종, AI 10줄 구조화) (PROMPT 58) | Claude Code |
| 2026-05-27 | 본인 비밀번호 변경 기능 (validatePassword + change-password API + 모달 UI, INFRA-3 일부) (PROMPT 57) | Claude Code |
| 2026-05-27 | TOTP 2단계 인증 보류 결정 반영 (사용자 정정, 소수 조직 관리자 승인으로 충분) (PROMPT 56B) | Claude Code |
| 2026-05-27 | INFRA 로드맵 갱신 (옵션 A 결정, 매니지드 전환 호환성 5원칙, TOTP 채택, 신규 기능 우선순위) (PROMPT 56) | Claude Code |
| 2026-05-27 | INFRA-2A-3: 어댑터 9개 _flatten 보강 + _toStr DateTime 헬퍼 도입 (V2 시나리오 통과) (PROMPT 55) | Claude Code |
| 2026-05-27 | 개인정보·보안 이슈 트래커 신규 작성 (PRIVACY_ISSUES.md, ISSUE-001~006 등록) (PROMPT 54) | Claude Code |
| 2026-05-27 | INFRA-2A-2 영향 분석 (DateTime/Boolean/Naming 패턴, INFRA-2A-2_ANALYSIS.md) (PROMPT 53) | Claude Code |
| 2026-05-22 | 자동 푸시 정책 도입 (일반 수정 자동, 중대 변경 수동) (PROMPT 53A) | Claude Code |
| 2026-05-22 | 개인정보 보호 원칙 신규 작성 (HRPRIVACY_PRINCIPLES.md, B-1~B-4+C 결정 반영) (PROMPT 52) | Claude Code |
| 2026-05-21 | 국내 호스팅 4사 비교 (md+xlsx, 신뢰도·인지도 ×2 가중 추가) → NCloud 선정 (PROMPT 51) | Claude Code |
| 2026-05-21 | INFRA-2 로드맵 재정리 + 표준 검증 시나리오 V1/V2/V3 도입 (PROMPT 50) | Claude Code |
| 2026-05-21 | Docker env_file 추가 (LLM_* 환경변수 컨테이너 주입, AI 요약 403 해결) (PROMPT 49) | Claude Code |
| 2026-05-20 | Docker 환경 Prisma DATABASE_URL 절대경로 수정 (잠복 버그 — INFRA-1 시점부터 존재, Prisma 라우터 미검증으로 미발견) (PROMPT 48) | Claude Code |
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

> **현재 운영 상태 (2026-05-27)**: 실제 운영 가능한 평가 방식은 MBO만. OKR은 운영 관리 도구로만 동작.
> 외부 영업 시점 마케팅 표현 정확화 예정 (개발 백로그 BL-003 참조).

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

> 상위 수준 체크리스트. 세부 로드맵 및 PR 분리 원칙은 아래 "INFRA-2 로드맵 (재정리)" 섹션 참조.

### INFRA-2A: PostgreSQL 전환
- [x] INFRA-2A-1: PostgreSQL 호환 schema 설계 (2026-05-20)
- [x] INFRA-2A-2: DateTime/Boolean 타입 전환 영향 분석 (2026-05-27, INFRA-2A-2_ANALYSIS.md 참조)
- [x] INFRA-2A-3: 어댑터 _flatten() DateTime → ISO string 변환 추가 (2026-05-27)
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

### INFRA-2C: Object Storage (보류 — ISSUE-007 결정 의존)

**보류 사유**: PRIVACY_ISSUES.md ISSUE-007(첨부파일 정책 관찰)의 결정에 따라 진행 여부 달라짐.
- 첨부 유지(A) 또는 용량 제한(B) 결정 시: INFRA-2C 진행
- 첨부 비활성화(C) 또는 제거(D) 결정 시: INFRA-2C 불필요

**결정 시점**: 2026-12 (사이냅 자체 운영 6개월 후) 또는 외부 영업 직전

- [ ] ISSUE-007 결정 (2026-12 예정)
- [ ] (조건부) Object Storage 클라이언트 도입
- [ ] (조건부) file_data 이관 스크립트
- [ ] (조건부) 다운로드/업로드 라우터 변경

### INFRA-2D: NCloud 환경 셋업 (옵션 A 결정, 2026-05-27)

**선정 사양**: Server 1대 + Docker PostgreSQL 16-alpine 자체 설치 (매니지드 DB 보류)

**선정 이유**:
- 사이냅 자체 운영 단계(단계 1)에서는 HA·매니지드 자동화 부담 없음
- 월 약 ₩68,000으로 비용 약 80% 절감 (매니지드 HA 대비)
- 1인 개발자 부업 운영 가능 (월 1~2시간)
- 향후 외부 영업 시점(단계 2)에 매니지드로 전환 가능한 호환성 유지

**Phase 1: 옵션 A 운영 (사내 사용 기간)**

- [x] 호스팅 선정: NCloud (INFRA_HOSTING_COMPARISON 참조, 2026-05-21)
- [x] 호스팅 검증: Vercel + Supabase·Railway 비교 후 NCloud 유지 결정 (INFRA_NCLOUD_VS_SUPABASE_VERCEL, 2026-05-27)
- [ ] NCloud 무료 평가판 신청 (7~30일)
- [ ] Server 인스턴스 셋업 (2vCPU/4GB, ₩60,000/월)
- [ ] 추가 디스크 50GB 마운트 (DB 데이터 + 첨부 파일)
- [ ] Docker PostgreSQL 16-alpine 자체 설치 (Docker Compose)
- [ ] Object Storage 50GB (백업 + 첨부 파일 임시 보관)
- [ ] 자체 백업 자동화 (`pg_dump` + Object Storage Lifecycle, 일간 7 + 주간 4 + 월간 12)
- [ ] HTTPS 인증서 적용 (Let's Encrypt 또는 NCloud 발급)
- [ ] 도메인 연결
- [ ] 모니터링 자동화 (NCloud Cloud Insight 무료, 디스크 80% / 인스턴스 다운 알림)
- [ ] 백업 복구 절차 문서화 (INFRA_BACKUP_RECOVERY.md 신규 작성)
- [ ] V3 검증 시나리오 통과 (PROMPT 50)

**Phase 2: 매니지드 전환 (외부 영업 시점, 미래)**

- [ ] NCloud Cloud DB for PostgreSQL 16 신청 (HA 자동)
- [ ] 데이터 마이그레이션 (`pg_dump` → restore, 약 30분 다운타임)
- [ ] DATABASE_URL 환경변수 갱신 (1줄 변경)
- [ ] HA 활성화 + Read Replica 추가 (Pro 사양)
- [ ] 자동 백업 정책 검토 (NCloud 매니지드 + Object Storage Lifecycle 병행)
- [ ] V3 검증 시나리오 재실행

**매니지드 전환 호환성 유지 원칙 (Phase 1 운영 시 준수)**:

1. **PostgreSQL 16 사용** — Phase 1·2 동일 버전, 호환성 보장
2. **표준 SQL 기능만 사용** — Prisma ORM이 자동 보장. PostgreSQL-specific 확장 회피
3. **`pg_dump --format=custom --no-owner --no-acl` 백업 사용** — 다른 환경 복원 시 권한 문제 회피
4. **DATABASE_URL 환경변수화** — 코드 변경 없이 연결 대상 교체 가능
5. **매니지드 마이그레이션 절차 문서화** — INFRA_MIGRATION_PLAN.md 향후 작성, 분기 1회 절차 검토

**전환 시점 판단 기준**:

다음 신호 중 2개 이상 발생 시 Phase 2 전환:
- 외부 영업 1순위 고객사 등장 (HA·SLA 필요)
- 동시 사용자 200명 초과 (단일 인스턴스 성능 한계)
- DB 다운으로 분쟁 발생
- 디스크 풀 위기 1회 이상
- 백업 복구 실패 경험
- 분기별 점검 부담 누적

### INFRA-3: 보안 강화
- [x] .env 분리 (2026-05-13, PROMPT 34)
- [x] **본인 비밀번호 변경 기능** (2026-05-27, PROMPT 57)
  - 현재 비밀번호 확인 + 새 비밀번호 입력
  - 비밀번호 정책 (최소 길이, 복잡도)
  - 변경 후 다른 세션 무효화 (재로그인)
  - 감사 로그 기록 (PASSWORD_CHANGED)
  - 관리자가 다른 사용자 비밀번호 초기화 기능은 별도 (후순위)
- [ ] ~~TOTP 2단계 인증~~ — **보류 (2026-05-27 결정)**
  - 사용자 결정: "소수 조직의 관리자 승인 절차로 충분"
  - 향후 재검토 시점: 외부 영업·확장 시점
  - 채택 시 적용 방안 (기록 유지):
    - 라이브러리: speakeasy + qrcode
    - DB 컬럼 추가: totp_secret(암호화), totp_enabled, totp_backup_codes(해시)
    - API: setup / verify / disable
    - 백업 코드 10개 (1회용)
    - 인사팀 비상 해제 기능
    - 비용 0, 휴대폰번호 수집 없음, HRPRIVACY 원칙 영향 없음
  - 참고: 외부 본인인증(PASS/NICE)보다 TOTP가 본 시스템에 더 적합 (글로벌 표준, 외부 의존 없음)
- [ ] AES-256-CBC → AES-256-GCM 마이그레이션
  - 기존 데이터 재암호화 필요
  - 신규 데이터부터 GCM 적용
  - 호환 기간 동안 두 알고리즘 모두 복호화 지원
- [ ] JWT_SECRET, ENC_SECRET을 docker-compose.yml의 평문 → .env로 분리 (`${VAR}` 참조)
- [ ] JWT 키 로테이션 정책 (선택)

### INFRA-4: 법무·계약·운영 문서
- [x] 개인정보 보호 원칙 (HRPRIVACY_PRINCIPLES.md) 작성 — 2026-05-21
- [x] 개인정보·보안 이슈 트래커 (PRIVACY_ISSUES.md) 작성 — 2026-05-27 (ISSUE-001~007 등록)
- [ ] 개인정보처리방침 (HRPRIVACY 기반 작성, 인프라 안정화 후)
- [ ] 표준약관
- [ ] DPA (데이터 처리 위탁 계약, B2B 표준)
- [ ] PRIVACY_INVENTORY.md — 개인정보 처리 인벤토리 (인프라 안정화 후, 단계 1 진입 직전)
- [ ] SECURITY_INVENTORY.md — 보안 통제 인벤토리 (인프라 안정화 후, 단계 1 진입 직전)
- [ ] INCIDENT_RESPONSE.md — 사고 대응 절차 (단계 1 진입 직전)
- [ ] SECURITY_WHITEPAPER.md — 보안 솔루션 백서 (외부 영업용, 단계 2 진입 직전)
- [ ] 개인정보 관리 백서 (PRIVACY_INVENTORY와 별도, 외부 감사·조사 대응)
- [ ] 사용자 매뉴얼 (페이지별 우측 위치)
- [ ] FAQ 페이지
- [ ] 고객센터 페이지 (FAQ + 향후 AI 챗봇)
- [ ] ISSUE-001~007 해결 (PRIVACY_ISSUES.md 참조)

---

## 신규 기능 우선순위 (2026-05-27 결정)

사용자(대표) 결정에 따라 다음 순서로 진행:

### 우선순위 1: 본인 비밀번호 변경 ✅ 완료 (2026-05-27, PROMPT 57)
- 위험도: 중상 (인증 영역)
- 작업량: 1~2일
- INFRA-3 일부 미리 완료
- 자동 푸시: 회색 지대 (인증 영역, 사용자 확인 후 푸시)

### 우선순위 2: 전체 조직 AI 요약 + 평가 통계 ✅ 완료 (2026-05-27, PROMPT 58)
- 위험도: 중 (기능 추가, 스키마 변경 없음)
- 구성: 조직 트리(회사/팀) + 기간별 등급 통계 + 분기별 추이 차트(라인/바/히트맵) + AI 10줄 구조화 요약
- 권한: master/admin 전체, 조직장 본인+하위 재귀, 일반 user 접근 불가
- 신규 API: org-tree, quarterly-trend, grade-distribution, org-ai-summary

### 보류 (별도 검토 필요)
- ~~외부 본인인증 (카톡/PASS)~~ — TOTP로 대체 결정
- TOTP 2단계 인증 — 소수 조직 관리자 승인 절차로 충분 (2026-05-27 결정). 외부 영업·확장 시점에 재검토. 채택 시 적용 방안은 INFRA-3 섹션 참조.
- 평가 결과 Excel/PDF 출력 (영업 단계에서 필요)
- 이메일 알림 (단계 2 진입 직전)
- KPI 평가방식 상세 구현 (사용자 피드백 기반 결정)
- PC 전용 UI 최적화 — PC 모니터 전체 활용한 컴팩트 레이아웃, 평가/분석/관리 화면 한 눈에 보기 (2026-05-27 결정, 우선순위 4, PROMPT 58B/58C/59 완료 후 진행)

---

## 표준 검증 시나리오 (인프라 변경 시 필수 실행)

> 인프라 관련 변경(Docker, 환경변수, 스키마, DB 등) 후 다음 시나리오를 반드시 실행한다.
> 표층(로그인 화면)만 확인하면 잠복 버그를 놓친다 (PROMPT 48, 49 사례 참조).

### 검증 시나리오 V1 — 최소 필수 (5분)

매 인프라 변경 후 무조건 실행:

1. **컨테이너/서버 기동** — 로그에 ERROR, Exception, FATAL 메시지 없음
2. **환경변수 주입 확인** — 컨테이너 안에서 다음 환경변수가 모두 SET 상태:
   - `DATABASE_URL`
   - `JWT_SECRET`, `ENC_SECRET`
   - `LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL`
   - `SQLITE_JOURNAL_MODE` (Docker 환경) 또는 미설정 (로컬, WAL 기본)
3. **로그인** — ceo@synapsoft.com / admin1234 정상 로그인
4. **Prisma 라우터 검증** — 로그인 직후 자동 호출되는 `/api/auth/me`가 정상 응답
5. **카테고리 조회** — 관리자 메뉴 → 카테고리 관리 진입 (Prisma 기반 `/api/categories` 검증)
6. **AI 요약** — 성과관리 → AI 요약 버튼 → 정상 응답 (LLM 환경변수 + 인증 + 사내 LLM 연결성 검증)

### 검증 시나리오 V2 — 주요 변경 시 추가 실행 (15분)

스키마 변경, DB 마이그레이션, 어댑터 추가/수정 시 V1에 더해 다음 실행:

7. **목표 작성 사이클** — 일반 직원(dev3)으로 로그인 → 1차 분기 목표 작성 → 제출 → 로그아웃
8. **승인 사이클** — 상사(dev1)로 로그인 → 승인 대기 목록에서 dev3 목표 승인 → 로그아웃
9. **자기평가 사이클** — dev3 로그인 → 자기 최종평가 점수/의견 입력 → 제출 → 로그아웃
10. **상사 평가 사이클** — dev1 로그인 → dev3 최종평가 점수/의견 입력 → 등급 선택 → 확정
11. **감사 로그 확인** — 관리자 메뉴 → 감사 로그 200건 조회 → 위 7~10 동작이 기록됨
12. **AI 요약 (개인용)** — dev3 본인 성과 요약 + dev1 팀 성과 요약 둘 다 동작

### 검증 시나리오 V3 — DB 종류 변경 시 전체 검증 (1시간)

PostgreSQL 마이그레이션(INFRA-2A-4) 같이 DB 종류가 바뀌는 경우 V2에 더해 다음 추가:

13. **모든 어댑터 도메인 검증** — User, GoalCategory, GradeCriteria, Organization, EvalCycle, Goal, Feedback, FinalEvaluation, ProgressReport 9개 도메인 각각 최소 1개 CRUD 실행
14. **암호화 필드 검증** — 목표명, KPI, 자기평가 의견, 상사 평가 의견을 입력 → DB 직접 조회 시 암호화된 형태(`iv:enc` hex)로 저장됨 확인
15. **트랜잭션 검증** — Goal 일괄 교체(`replaceByEvalId`), Feedback Aggregate Root, FinalEvaluation Aggregate Root 등이 부분 실패 시 롤백되는지 확인
16. **외래키 정합성 검증** — `users` 1개 삭제 시 child(eval_cycles, goals 등)가 정책대로 처리되는지 확인 (CASCADE, SET NULL, RESTRICT)
17. **datetime 일관성 검증** — DB에 저장된 `created_at`이 Asia/Seoul 기준인지 (TZ=Asia/Seoul 환경변수 효과 확인)

---

## INFRA-2 로드맵 (재정리)

### INFRA-2A: PostgreSQL 전환
- [x] INFRA-2A-1: PostgreSQL 호환 schema 설계 (2026-05-20, PROMPT 46)
- [x] INFRA-2A-2: DateTime/Boolean 타입 전환 영향 분석 (2026-05-27, INFRA-2A-2_ANALYSIS.md 참조)
- [x] INFRA-2A-3: 어댑터 _flatten() DateTime → ISO string 변환 추가 (2026-05-27)
- [ ] INFRA-2A-4: 로컬 PostgreSQL 컨테이너 마이그레이션 + 기능 검증 (V3 시나리오 필수)
- [ ] INFRA-2A-5: SQLite → PostgreSQL 데이터 이관 스크립트

**PR 분리 원칙**: 2A-2 ~ 2A-5는 각각 독립 PR로 분리. 한 PR에 두 단계 묶지 않음. 롤백 가능성 보장.

**데이터 이관 안전장치 (2A-5)**:
- 이관 직전 SQLite DB 파일 백업 (`hrmanage.db.bak.YYYYMMDD-HHMM`)
- 이관 후 행 수 비교 (모든 테이블 row count 일치 확인)
- 이관 후 V3 검증 시나리오 통과까지 운영 DB 전환 보류
- 이관 실패 시 SQLite 백업 복원 절차 명시

### INFRA-2B: 정합성 100% 적용
- [ ] phase 일관성 CHECK 제약
- [ ] score-done 일관성 트리거
- [ ] 승인 순서 CHECK 제약
- [ ] 승인 1인 1회 UNIQUE 제약
- [ ] 외래키 ON DELETE 정책 명시 (INFRA-2A-1에서 schema에 반영, 마이그레이션은 INFRA-2A-4)
- [ ] 암호화 검증 CHECK 제약 (iv:enc 정규식)
- [ ] 타임스탬프 일관성 CHECK 제약
- [ ] force-phase 백도어 master 제한 + 감사로그 강제

**PR 분리 원칙**: 각 제약을 1개씩 별도 PR로 분리. 이유: 제약 추가 후 기존 데이터에서 위반 발견 시 롤백 단순화.

### INFRA-2C: Object Storage (보류 — ISSUE-007 결정 의존)

**보류 사유**: PRIVACY_ISSUES.md ISSUE-007(첨부파일 정책 관찰)의 결정에 따라 진행 여부 달라짐.
- 첨부 유지(A) 또는 용량 제한(B) 결정 시: INFRA-2C 진행
- 첨부 비활성화(C) 또는 제거(D) 결정 시: INFRA-2C 불필요

**결정 시점**: 2026-12 (사이냅 자체 운영 6개월 후) 또는 외부 영업 직전

- [ ] ISSUE-007 결정 (2026-12 예정)
- [ ] (조건부) Object Storage 클라이언트 도입
- [ ] (조건부) file_data 이관 스크립트
- [ ] (조건부) 다운로드/업로드 라우터 변경

### INFRA-2D: NCloud 환경 셋업 (옵션 A 결정, 2026-05-27)

**선정 사양**: Server 1대 + Docker PostgreSQL 16-alpine 자체 설치 (매니지드 DB 보류)

**선정 이유**:
- 사이냅 자체 운영 단계(단계 1)에서는 HA·매니지드 자동화 부담 없음
- 월 약 ₩68,000으로 비용 약 80% 절감 (매니지드 HA 대비)
- 1인 개발자 부업 운영 가능 (월 1~2시간)
- 향후 외부 영업 시점(단계 2)에 매니지드로 전환 가능한 호환성 유지

**Phase 1: 옵션 A 운영 (사내 사용 기간)**

- [x] 호스팅 선정: NCloud (INFRA_HOSTING_COMPARISON 참조, 2026-05-21)
- [x] 호스팅 검증: Vercel + Supabase·Railway 비교 후 NCloud 유지 결정 (INFRA_NCLOUD_VS_SUPABASE_VERCEL, 2026-05-27)
- [ ] NCloud 무료 평가판 신청 (7~30일)
- [ ] Server 인스턴스 셋업 (2vCPU/4GB, ₩60,000/월)
- [ ] 추가 디스크 50GB 마운트 (DB 데이터 + 첨부 파일)
- [ ] Docker PostgreSQL 16-alpine 자체 설치 (Docker Compose)
- [ ] Object Storage 50GB (백업 + 첨부 파일 임시 보관)
- [ ] 자체 백업 자동화 (`pg_dump` + Object Storage Lifecycle, 일간 7 + 주간 4 + 월간 12)
- [ ] HTTPS 인증서 적용 (Let's Encrypt 또는 NCloud 발급)
- [ ] 도메인 연결
- [ ] 모니터링 자동화 (NCloud Cloud Insight 무료, 디스크 80% / 인스턴스 다운 알림)
- [ ] 백업 복구 절차 문서화 (INFRA_BACKUP_RECOVERY.md 신규 작성)
- [ ] V3 검증 시나리오 통과 (PROMPT 50)

**Phase 2: 매니지드 전환 (외부 영업 시점, 미래)**

- [ ] NCloud Cloud DB for PostgreSQL 16 신청 (HA 자동)
- [ ] 데이터 마이그레이션 (`pg_dump` → restore, 약 30분 다운타임)
- [ ] DATABASE_URL 환경변수 갱신 (1줄 변경)
- [ ] HA 활성화 + Read Replica 추가 (Pro 사양)
- [ ] 자동 백업 정책 검토 (NCloud 매니지드 + Object Storage Lifecycle 병행)
- [ ] V3 검증 시나리오 재실행

**매니지드 전환 호환성 유지 원칙 (Phase 1 운영 시 준수)**:

1. **PostgreSQL 16 사용** — Phase 1·2 동일 버전, 호환성 보장
2. **표준 SQL 기능만 사용** — Prisma ORM이 자동 보장. PostgreSQL-specific 확장 회피
3. **`pg_dump --format=custom --no-owner --no-acl` 백업 사용** — 다른 환경 복원 시 권한 문제 회피
4. **DATABASE_URL 환경변수화** — 코드 변경 없이 연결 대상 교체 가능
5. **매니지드 마이그레이션 절차 문서화** — INFRA_MIGRATION_PLAN.md 향후 작성, 분기 1회 절차 검토

**전환 시점 판단 기준**:

다음 신호 중 2개 이상 발생 시 Phase 2 전환:
- 외부 영업 1순위 고객사 등장 (HA·SLA 필요)
- 동시 사용자 200명 초과 (단일 인스턴스 성능 한계)
- DB 다운으로 분쟁 발생
- 디스크 풀 위기 1회 이상
- 백업 복구 실패 경험
- 분기별 점검 부담 누적

### INFRA-3: 보안 강화
- [x] .env 분리 (2026-05-13, PROMPT 34)
- [x] **본인 비밀번호 변경 기능** (2026-05-27, PROMPT 57)
  - 현재 비밀번호 확인 + 새 비밀번호 입력
  - 비밀번호 정책 (최소 길이, 복잡도)
  - 변경 후 다른 세션 무효화 (재로그인)
  - 감사 로그 기록 (PASSWORD_CHANGED)
  - 관리자가 다른 사용자 비밀번호 초기화 기능은 별도 (후순위)
- [ ] ~~TOTP 2단계 인증~~ — **보류 (2026-05-27 결정)**
  - 사용자 결정: "소수 조직의 관리자 승인 절차로 충분"
  - 향후 재검토 시점: 외부 영업·확장 시점
  - 채택 시 적용 방안 (기록 유지):
    - 라이브러리: speakeasy + qrcode
    - DB 컬럼 추가: totp_secret(암호화), totp_enabled, totp_backup_codes(해시)
    - API: setup / verify / disable
    - 백업 코드 10개 (1회용)
    - 인사팀 비상 해제 기능
    - 비용 0, 휴대폰번호 수집 없음, HRPRIVACY 원칙 영향 없음
  - 참고: 외부 본인인증(PASS/NICE)보다 TOTP가 본 시스템에 더 적합 (글로벌 표준, 외부 의존 없음)
- [ ] AES-256-CBC → AES-256-GCM 마이그레이션
  - 기존 데이터 재암호화 필요
  - 신규 데이터부터 GCM 적용
  - 호환 기간 동안 두 알고리즘 모두 복호화 지원
- [ ] JWT_SECRET, ENC_SECRET을 docker-compose.yml의 평문 → .env로 분리 (`${VAR}` 참조)
- [ ] JWT 키 로테이션 정책 (선택)

### INFRA-4: 법무·계약·운영 문서
- [x] 개인정보 보호 원칙 (HRPRIVACY_PRINCIPLES.md) 작성 — 2026-05-21
- [x] 개인정보·보안 이슈 트래커 (PRIVACY_ISSUES.md) 작성 — 2026-05-27 (ISSUE-001~007 등록)
- [ ] 개인정보처리방침 (HRPRIVACY 기반 작성, 인프라 안정화 후)
- [ ] 표준약관
- [ ] DPA (데이터 처리 위탁 계약, B2B 표준)
- [ ] PRIVACY_INVENTORY.md — 개인정보 처리 인벤토리 (인프라 안정화 후, 단계 1 진입 직전)
- [ ] SECURITY_INVENTORY.md — 보안 통제 인벤토리 (인프라 안정화 후, 단계 1 진입 직전)
- [ ] INCIDENT_RESPONSE.md — 사고 대응 절차 (단계 1 진입 직전)
- [ ] SECURITY_WHITEPAPER.md — 보안 솔루션 백서 (외부 영업용, 단계 2 진입 직전)
- [ ] 개인정보 관리 백서 (PRIVACY_INVENTORY와 별도, 외부 감사·조사 대응)
- [ ] 사용자 매뉴얼 (페이지별 우측 위치)
- [ ] FAQ 페이지
- [ ] 고객센터 페이지 (FAQ + 향후 AI 챗봇)
- [ ] ISSUE-001~006 해결 (PRIVACY_ISSUES.md 참조)
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
