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
├── server/
│   └── index.js               ← 메인 서버 전체 (API + DB + 암호화 + 시드, ~2000줄)
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
└── data/hrmanage.db
```

---

## 기술 스택 상세

```
런타임:     Node.js 18+
프레임워크: Express 4
DB:         better-sqlite3 (SQLite)
인증:       JWT 8h, AES-256-CBC 암호화
보안:       helmet, cors, bcryptjs
```

### 암호화 필드
goals: name, kpi / eval_cycles: self_reason / goal_approvals: note
feedbacks: overall_note / feedback_items: note
final_evaluations: self_note, mgr_note, second_mgr_note

---

## DB 스키마

```sql
users              id, name, email, password_hash, role, dept, grade, title,
                   manager_id, is_active, account_status, signup_note, org_id, eval_mode
eval_cycles        id, user_id, period_type, period_label, eval_year, phase,
                   self_reason(암호화), reject_reason, locked
goals              id, eval_id, category_id, name(암호화), kpi(암호화), weight, sort_order, status
goal_categories    id, name, description, weight, color, text_color, sort_order, is_active
goal_approvals     id, eval_id, approver_id, level, action, note(암호화)
eval_approval_history  id, eval_id, user_id, period_label, eval_year, action, reason
feedbacks          id, eval_id, author_id, overall_note(암호화)
feedback_items     id, feedback_id, goal_id, score, note(암호화)
final_evaluations  id, eval_id, self_note(암호화), self_done, mgr_note(암호화), mgr_done,
                   mgr_approver_id, final_score, final_grade, selected_grade,
                   second_mgr_done, second_mgr_note(암호화), second_mgr_id, locked
final_eval_scores  id, final_id, goal_id, self_score, mgr_score, second_mgr_score
progress_reports   id, eval_id, author_id, content(암호화)
report_files       id, report_id, feedback_id, final_eval_id, file_name, file_data
app_settings       key, value, updated_by, updated_at
eval_periods       id, period_type, period_label, eval_year, is_active, eval_mode, locked
eval_period_modes  id, period_id, manager_id, eval_mode, locked  UNIQUE(period_id,manager_id)
audit_logs         id, user_id, action, target_id, target_name, detail, ip
grade_criteria     id, grade_code, grade_name, description, note, sort_order, is_active
organizations      id, name, leader_id, parent_id, description, sort_order, is_active
okr_cycles         id, user_id, period_label, eval_year, phase
okr_objectives     id, cycle_id, title, description, sort_order
okr_key_results    id, objective_id, title, target_value, current_value, unit, weight, sort_order
```

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

---

## 알려진 버그 및 미완성

### 🟡 미완성 기능
- [ ] 비밀번호 변경 기능
- [ ] 동일 기간 중복 평가 방지
- [ ] 평가 결과 Excel/PDF 출력
- [ ] 이메일 알림
- [ ] KPI 평가방식 상세 구현
- [ ] 성과관리 전체 조직 뷰 (admin용)

### 🟢 운영 서버 전환 시 필수
- [ ] ENC_SECRET, JWT_SECRET → .env 분리
- [ ] AES-256-CBC → AES-256-GCM
- [ ] SQLite → PostgreSQL
- [ ] HTTPS 적용
- [ ] ANTHROPIC_API_KEY → .env 분리

---

## 최근 개발 이력 (최근 30건)

| 날짜 | 작업 내용 | 작업자 |
|------|-----------|--------|
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
