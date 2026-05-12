# ㈜사이냅소프트 인사평가 시스템 — CLAUDE.md

> ## Claude Code 필독 지시사항 (매 세션 시작 시 반드시 준수)
>
> ### 작업 전
> - 이 CLAUDE.md를 **먼저** 읽고 현재 상태를 파악한 뒤 작업을 시작하라.
> - 코드 파일은 명시적으로 요청받은 경우에만 열어라. 구조·API·버그 정보는 이 문서를 우선 참고.
>
> ### 작업 후 (절대 생략 금지 — 다음 세션 컨텍스트 유실 방지)
> 작업이 끝나면 **반드시** 아래 순서로 이 파일을 업데이트하라:
> 1. 완료된 버그/기능 → `[ ]` → `[x]` 체크
> 2. 새로 발견한 버그 → "알려진 버그" 섹션에 추가
> 3. 추가된 API → "API 엔드포인트 목록" 업데이트
> 4. 새 파일/함수 → "파일 구조" 또는 "기술 스택" 섹션 업데이트
> 5. 설계 결정 → "핵심 설계 원칙" 섹션에 추가
> 6. "개발 이력" 테이블 맨 위에 날짜·작업내용·"Claude Code" 한 줄 추가
>
> **이 업데이트를 빠뜨리면 다음 세션에서 컨텍스트가 유실된다. 어떤 이유로도 생략하지 말 것.**

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | ㈜사이냅소프트 인사평가 시스템 |
| 목적 | 웹 인트라넷 탑재용 MBO 기반 인사평가 모듈 |
| 평가 방식 | MBO (목표관리) |
| 현재 버전 | 로컬 테스트 버전 v1.1 |
| 실행 방법 | `npm start` 또는 `실행.bat` → http://localhost:3000 |
| 개발 환경 | Claude.ai (설계/기획) → Claude Code (구현/디버깅) |
| Node.js | v18 이상 필요. v24에서 better-sqlite3 prebuild 없어 VS Build Tools 컴파일 필요 |
| GitHub | https://github.com/jeremydev99/hrmanage (Public) |
| Git push | Git Bash에서 `push` 입력 (alias 설정됨) |

---

## 파일 구조

```
C:\claudeprojects\hrmanage\
├── CLAUDE.md                  ← 이 파일 (컨텍스트 + 작업 지시)
├── README.md                  ← 사용자용 설치 가이드
├── package.json               ← scripts: start(node), install-deps(npm install)
│                                 deps: express, better-sqlite3, bcryptjs, jsonwebtoken, cors, helmet
├── 실행.bat                   ← npm install + node server/index.js + 브라우저 자동 오픈
├── server/
│   └── index.js               ← 메인 서버 전체 (API + DB초기화 + 암호화 + 시드데이터, ~1415줄)
├── public/
│   ├── index.html             ← SPA 진입점 (스크립트 로딩 순서 중요: api→app→components→pages)
│   ├── css/
│   │   └── style.css          ← 오렌지 테마 CSS 변수 (--o50~--o800) + 전체 스타일
│   └── js/
│       ├── api.js             ← fetch 래퍼 (API.get/post/put/patch/del, Bearer 토큰 자동 첨부)
│       ├── app.js             ← SPA 라우터, App 전역 객체 (App.user, App.categories, App.navigate)
│       ├── components.js      ← 공통 UI 컴포넌트 + 유틸 함수
│       └── pages/
│           ├── login.js           ← 로그인 화면
│           ├── my-eval.js         ← 목표 설정 + 승인 요청 + 평가 현황
│           ├── approvals.js       ← 목표 승인 관리 (승인자용)
│           ├── feedback.js        ← 중간 피드백 (받기 + 주기, 아코디언 접기/펼치기)
│           ├── final-eval.js      ← 최종 평가 (자기평가 + 상사평가 + 결과 보기)
│           ├── progress-report.js ← 중간 보고 (목표별 작성란 + 종합의견)
│           ├── okr-eval.js        ← OKR 작성/진행률 관리 (Pages.okrEval, startNewOKR, updateOKRProgress)
           └── admin.js           ← 관리자 설정 (카테고리/조직도/권한/감사로그/등급기준/평가기간)
└── data/
    └── hrmanage.db            ← SQLite DB (서버 첫 실행 시 자동 생성, .gitignore 권장)
```

---

## 전체 개발 과정 (Claude.ai 대화 기록)

### Phase 1 — 기본 인사평가 모듈
- MBO 방식 채택
- 기능: 평가 항목 설정, 점수 입력/집계, 결과 리포트/차트, 평가 이력 관리, 평가자·피평가자 의견 기재
- 기술 스택: 순수 HTML/CSS/JS (빌드 없음), 오렌지 컬러 테마

### Phase 2 — 목표 설정 및 승인 워크플로우
- 목표는 본인이 직접 선정, 승인자(상급자) 승인 후 확정
- 승인 단계: 1단계 또는 2단계 (인사팀 옵션 선택 가능)
- 플로우: 목표 작성 → 승인 요청 → N단계 승인 → 목표 확정

### Phase 3 — 평가 주기 선택 + 오렌지 테마
- 평가 주기: 분기(연 4회) 또는 반기(연 2회) — 피평가자가 직접 선택
- 세부 기간: 1~4분기 또는 상/하반기 중 선택
- 오렌지 컬러 테마 전면 적용 (CSS 변수: --o50 ~ --o800)

### Phase 4 — 전체 평가 사이클
- **"중간 평가" → "중간 피드백"으로 용어 확정** (코드 전체에 적용됨)
- 중간 피드백: 횟수 무제한, 상사가 언제든 자유롭게 작성
- 최종 평가: 자기 최종평가 → 상사 최종평가 → 잠금(locked=1)
- 최종 평가 확정 후 인사팀(master/admin)만 수정 가능

### Phase 5 — 목표 카테고리 + 권한 관리 + 조직도
- **목표 카테고리**: 인사팀이 사전 설정 (기본: 업적목표 50% / 업무능력 30% / 근무태도 20%)
- 카테고리별 가중치 합계 100% 강제 (저장 전 검증)
- **권한 3단계**: master(인사책임자) / admin(인사팀원) / user(일반사용자)
- **조직도 기반 자동 승인**: users.manager_id 재귀 쿼리로 N단계 승인자 자동 결정
- 1차 승인자도 차상위 승인자에게는 피평가자로 자동 등록됨
- 인사팀 설정 메뉴: master/admin에게만 표시, user에게 완전히 숨김

### Phase 6 — 클라우드 서버 아키텍처 (synap-hr-system.zip, 별도 패키지)
- **현재 구현률 약 40~50% — 골격만 완성, 실제 운영 불가**
- 기술: Node.js + Express + PostgreSQL + Redis + Docker Compose
- 암호화: AES-256-GCM (필드 레벨), TLS 1.3 (전송), bcrypt (비밀번호)
- 앱 래핑: Capacitor 6 (iOS + Android)

### Phase 7 — 로컬 테스트 버전 완성 (현재 버전 / hrmanage 폴더)
- Node.js + SQLite 단독 실행 — Docker 불필요, npm install 후 즉시 실행
- 전체 기능 동작하는 완성된 로컬 테스트 버전 v1.0
- `실행.bat` 더블클릭 → 자동 설치 + 서버 시작 + 브라우저 열기

### Phase 8 — Claude Code 버그 수정 (v1.1, 2026-04-30)
- **`cancelApproval()` 수정**: 기존에는 API 호출 없이 화면만 전환. `POST /api/evals/:id/cancel` 신규 엔드포인트 추가
- **`manager_id=null` PATCH 버그 수정**: `'manager_id' in req.body` 체크로 변경
- **Stars `data-goal-id` 정리**: dead attributes 제거
- **최종 점수 계산 카테고리 가중치 반영**: `calcFinalScore()` 추가

---

## 기술 스택 상세

### 백엔드 (server/index.js 단일 파일)
```
런타임:     Node.js 18+ (v24에서는 VS Build Tools 필요)
프레임워크: Express 4
DB:         better-sqlite3 (SQLite, 파일: data/hrmanage.db)
인증:       jsonwebtoken (JWT, 만료 8h)
암호화:     node:crypto 내장 (AES-256-CBC, scrypt 키 파생)
보안:       helmet, cors
비밀번호:   bcryptjs (salt rounds 10)
```

### 암호화 구조
```javascript
// server/index.js 상단 상수 (운영 시 .env로 분리 필수)
const ENC_SECRET = 'synap-local-enc-secret-32bytes!!';
const JWT_SECRET = 'synap-hr-local-dev-secret-2025';

// 암호화 함수 (AES-256-CBC)
encrypt(text) → "ivHex:cipherHex" 형식 문자열
decrypt(text) → 원문 문자열 (실패 시 '[복호화 오류]' 반환)

// 암호화 적용 필드
goals:              name, kpi
eval_cycles:        self_reason
goal_approvals:     note
feedbacks:          overall_note
feedback_items:     note
final_evaluations:  self_note, mgr_note, second_mgr_note
```

### 프론트엔드 전역 객체
```javascript
API       — fetch 래퍼 (api.js): API.get/post/put/patch/del
App       — 라우터/상태 (app.js)
            App.user          현재 로그인 사용자 {id, name, email, role, dept, title}
            App.categories    목표 카테고리 배열 (로그인 후 전역 캐시)
            App.navigate(id)  페이지 전환
            App.isAdmin()     master 또는 admin 여부
Pages     — 페이지 렌더러: Pages.login / myEval / approvals / feedback / finalEval / progressReport / admin
```

### 공통 컴포넌트 함수 (components.js)
```javascript
Stars(goalId, ctx, initial, onChange)  → 별점 컴포넌트 DOM 반환
flowBar(phase)                          → 평가 단계 진행바 DOM 반환
badge(text, cls)                        → <span class="bd bd-{cls}">
phaseBadge(phase) / roleBadge(role) / scoreLabel(score) / gradeEl(grade)
renderGoalsSummary(goals, categories)   → 목표 목록 HTML
showAlert(msg, type, container)         → 3.5초 자동 소멸 알림
calcFinalScore(goals, scores)           → 카테고리 가중치 반영 최종 점수 (v1.1)
```

### DB 스키마 (server/index.js initDB()에서 자동 생성)
```sql
users              id, name, email, password_hash, role, dept, grade, title,
                   manager_id, is_active, account_status, signup_note
eval_cycles        id, user_id, period_type, period_label, eval_year, phase,
                   self_reason(암호화), reject_reason(암호화), locked, created_at
goals              id, eval_id, category_id, name(암호화), kpi(암호화),
                   weight, sort_order, status
goal_categories    id, name, description, weight, color, text_color, sort_order, is_active
goal_approvals     id, eval_id, approver_id, level, action, note(암호화), created_at
eval_approval_history  id, eval_id, user_id, period_label, eval_year, action,
                       reason, approver_id, approver_name
feedbacks          id, eval_id, author_id, overall_note(암호화), created_at
feedback_items     id, feedback_id, goal_id, score, note(암호화)
final_evaluations  id, eval_id, self_note(암호화), self_done, self_done_at,
                   mgr_note(암호화), mgr_done, mgr_done_at, mgr_approver_id,
                   final_score, final_grade, selected_grade,
                   second_mgr_done, second_mgr_note(암호화),
                   second_mgr_id, second_mgr_done_at,
                   locked, locked_at
final_eval_scores  id, final_id, goal_id, self_score, mgr_score, second_mgr_score (추가)
progress_reports   id, eval_id, author_id, content(암호화), created_at
report_files       id, report_id, feedback_id, final_eval_id,
                   file_name, file_data, file_type, file_size
app_settings       key, value
eval_periods       id, period_type, period_label, eval_year, is_active, created_by
audit_logs         id, user_id, action, target_id, target_name, detail, ip, created_at
grade_criteria     id, grade_code, grade_name, description, note, sort_order, is_active
users:             ... eval_mode TEXT DEFAULT 'MBO' (추가)
okr_cycles:        id, user_id, period_label, eval_year, phase
okr_objectives:    id, cycle_id, title, description, sort_order
okr_key_results:   id, objective_id, title, target_value, current_value, unit, weight, sort_order
eval_periods:      ... eval_mode TEXT DEFAULT 'MBO', locked INTEGER DEFAULT 0 (추가)
eval_period_modes: id, period_id, manager_id, eval_mode, locked, created_at
                   UNIQUE(period_id, manager_id)
organizations:     id, name, leader_id, parent_id, description, sort_order, is_active
users:             ... org_id INTEGER (추가)
```

### 테스트 계정
| 이름 | 이메일 | 비번 | 권한 | 조직 |
|------|--------|------|------|------|
| 이대표 | ceo@synapsoft.com | admin1234 | master | 최상위 |
| 김인사 | hr1@synapsoft.com | admin1234 | master | 이대표 하위 |
| 박인사 | hr2@synapsoft.com | admin1234 | admin | 이대표 하위 |
| 최개발 | dev1@synapsoft.com | user1234 | user | 이대표 하위 |
| 정개발 | dev2@synapsoft.com | user1234 | user | dev1 하위 |
| 한개발 | dev3@synapsoft.com | user1234 | user | dev2 하위 |

**조직도**: dev3 → dev2 → dev1 → CEO

---

## 핵심 설계 원칙

1. **조직도 = 승인 체계**: manager_id 재귀로 N단계 자동 결정, 별도 테이블 없음
2. **최종 평가 잠금**: master/admin만 해제 가능 (`/api/admin/final/:id/unlock`)
3. **데이터 암호화**: 목표명/KPI/피드백/의견 AES-256-CBC
4. **권한 UI 분리**: 관리자 탭 user에게 완전 숨김
5. **중간 피드백**: 1차 상사 의무 / 2차 이상 선택, 아코디언 접기/펼치기
6. **용어**: "중간 평가" 아님, "중간 피드백"
7. **조직도 차트**: 저장 버튼 클릭 시만 반영 (localStorage)
8. **승인 수정/취소**: 관리자 정책 설정에 따라 허용 여부 결정
9. **직급(grade)**: 사원~사장 선택 또는 직접 입력
10. **피드백 열람**: 승인자 체인 전체가 하위 피드백 열람 가능
11. **최종평가 열람**: 승인자 체인 전체 열람 가능
12. **자기평가 재제출 불가**: self_done=1이면 서버에서 차단, 화면은 잠금 상태 표시
13. **미승인 계정**: 조직 지정 비활성화 (⚙ 조직 설정 활성화 버튼 클릭 후 활성화)
14. **중간 보고**: 목표별 작성란 + 종합의견란 구성, 제출 시 [목표명]\n내용 형식으로 저장
15. **최종평가 등급**: 카드 테이블 방식 (라디오 클릭) — 각 카드에 순위/등급코드/등급명칭/설명/비고 표시, 선택 시 오렌지 테두리 하이라이트, hidden input(fin-grade-sel-${evalId})으로 값 보관, selected_grade로 DB 저장
16. **2차 최종평가 순서**:
    - 1차(직속상사) 완료 + 2차설정 켜짐 + 2차평가자 존재 → phase: final_mgr2_pending
    - isSecond 판단: 피평가자 직속상사의 상사가 요청자인지 확인
    - 2차 완료 → second_mgr_done=1, phase: final_done, locked=1
    - 2차 설정 꺼짐 또는 2차평가자 없음 → 1차 완료 즉시 final_done
    - 2차 평가자 UI: 별점 입력 + 종합의견 작성 (등급 선택 카드만 숨김)
    - 1차: 별점 + 등급 선택 + 종합의견 / 2차: 별점 + 종합의견
    - 표시: 자기★ / 1차★ / 2차★ 모두 표시 (승인이력, 완료화면)
    - submitFinalMgr 2차 호출 시 is_second:true 포함
    - my-mgr-pending 2차 쿼리: final_mgr2_pending만 표시 (final_done 제외)
17. **최종평가 뱃지**: is_second 여부 관계없이 모두 '최종평가 대기'로 표시
18. **상사 최종평가 완료(mgr_done=1)**: 버튼 사라지고 완료 상태(점수+등급+별점+의견) 표시
19. **보안 강화**: 개발 완료 후 반드시 진행 (현재 키 하드코딩 상태)
20. **본인인증**: 운영 전환 시 추가 예정 (이메일/SMS/SSO 방식 미결정)
21. **관리자 평가단계 강제변경**: 전직원 현황 탭 각 행의 '단계 변경' 버튼 → `showForcePhaseModal` → `forcePhaseChange` → `POST /api/admin/eval/:id/force-phase`
22. **최종평가 잠금 해제 (master 전용)**: 전직원 현황 `final_done` 행의 '🔓 잠금 해제' 버튼 → `unlockFinalEval` → `POST /api/admin/final/:id/unlock`
    - self_done=0, mgr_done=0, second_mgr_done=0, locked=0
    - final_score/final_grade/selected_grade=null, 별점(mgr_score, second_mgr_score) null
    - phase='final_self'로 복구 → 자기평가부터 다시 작성 가능
23. **시스템 시간대**: `app_settings.timezone`으로 관리
    - 운영 주체 시간대 기준으로 모든 로그/기록 저장
    - 관리자 설정 - 평가정책 탭에서 변경 가능 (master 전용)
    - 기본값: Asia/Seoul (KST)
24. **PC 드롭다운 메뉴**:
    - 상위 클릭: 드롭다운만 펼침 (이동 없음), `toggleNavDD(id, event)`
    - 하위 클릭: 페이지 이동, `closeNavDD()`
    - 애니메이션: 0.15s `ddSlideDown` (scaleY + translateY)
    - CSS: `.nav-dd-menu`, `.nav-dd-menu.open`, `.dd-item`, `.dd-section-label`
    - 세션 보안 (`app_settings.session_policy` JSON):
      `close_on_browser_close`: sessionStorage 사용
      `timeout_minutes`: 만료 시각 localStorage, 1분마다 체크
      최대 8시간 강제 제한, 관리: 관리자 설정 → 평가 정책 (master만)
    - 성과관리 홈 (`Pages.perfHome`): 역할별 뷰(내 성과/우리팀/전체조직), AI 요약(`loadAISummary`)
      MBO: 최종점수, OKR: 달성률%, 대시보드 계층: 기본 2단계·최대 3단계
    - OKR 현황: `Pages.okrDashboard` (조회 전용)
25. **메뉴 구조 (PC/모바일 공통)**:
    - 내 평가 ▼: 내 평가 홈, 승인관리, 최종평가
    - 성과관리 ▼: 중간보고, 중간피드백, OKR 현황
    - 관리자 설정 ▼: 관리자 탭들 (admin+, `.admin-only` 클래스로 토글)
    - PC: `.nav-tabs-wrap` 드롭다운 (`toggleNavDropdown`, `closeNavDropdown`)
    - 모바일(480px): `nav-tabs-wrap` 숨김 → 햄버거 전체화면 메뉴
    - OKR 현황: `Pages.okrDashboard` (조회 전용, 편집 없음) — `app.js`에 정의
25. **로그인 공지사항**:
    - `app_settings.notice` (value, updated_by, updated_at)
    - `GET /api/notice`: 인증 없이 조회 가능
    - 수정 시 감사 로그 자동 기록
    - 관리 위치: 관리자 설정 → 평가 정책 탭 상단
    - 표시: 작성자명 + 직책 + 날짜 표시
25. **모바일 햄버거 메뉴**:
    - 헤더: ≡ + 로고 + 로그아웃 (3요소만, `.pc-only` / `.mobile-only` 유틸 클래스)
    - 메뉴: 사용자정보 + 내평가(아코디언) + 관리자설정(아코디언, 관리자만)
    - 아코디언: 클릭 시 하위 메뉴 펼침/접힘
    - 외부 클릭: 오버레이(id=`mobile-nav-overlay`) 클릭으로 닫힘
    - 관리자 하위탭: `switchAdmTab()` + 300ms setTimeout 으로 연동
25. **반응형 브레이크포인트**:
    - 768px: 탭 가로 스크롤, user-info 숨김
    - 480px: 햄버거 메뉴(`.hamburger-btn`), `.nav-tabs-wrap` 토글, 세로 스택 레이아웃
    - 버튼: `white-space:nowrap`으로 줄바꿈 방지
    - 입력폼: `font-size:16px` (iOS 자동 확대 방지)
    - 함수: `toggleMobileMenu()`, `closeMobileMenu()`, `closeMobileMenuOnOutside()`
25. **조직 구조**: `organizations` 테이블 (계층구조)
    - `leader_id = null` 허용 (미지정 시 parent 조직장에게 자동 위임)
    - `users.org_id` → 소속 조직 지정
    - 평가방식 조회: `org_id` 기반 조직장 체인 탐색 (`getMyOrgLeaderChain`)
    - 관리: 관리자 설정 → 조직 관리 탭 (`adm-orgtable`)
25. **평가방식 3차원 매핑**: 조직(org_id) × 시기(period) × 방식(MBO/OKR/KPI)
    - 결정 우선순위:
      1. `eval_period_modes` (조직장+기간 조합)
      2. `eval_periods.eval_mode` (기간 전사 기본값)
      3. `app_settings.eval_mode` (전사 전체 기본값)
    - 잠금: admin이 수동 잠금 → 잠금 후 master만 강제 변경 가능
    - 관리 위치: 관리자 설정 → 평가기간 관리 탭 (기간별 카드)
    - OKR 페이지: `Pages.okrEval(periodLabel, evalYear, mode)` (`public/js/pages/okr-eval.js`)
    - OKR 구조: Objective → Key Results (달성률 0~100%, 70% 이상 성공)
    - 내 평가 탭 기간 카드 버튼 분기:
      해당 기간 평가방식이 OKR/KPI → 🎯 OKR 작성하기 버튼
      해당 기간 평가방식이 MBO → 목표 작성 시작 버튼 (기존)

---

## API 엔드포인트 목록

```
POST   /api/auth/login                  로그인
POST   /api/auth/signup                 가입 신청 (인증 불필요)
GET    /api/auth/me                     내 정보

GET    /api/users                       전체 사용자 목록
POST   /api/users                       사용자 추가 (admin+)
PATCH  /api/users/:id                   사용자 수정 (admin+)
GET    /api/users/:id/approvers         승인자 체인 조회
GET    /api/users/signup-requests       가입 신청 목록 (admin+)
POST   /api/users/:id/approve           가입 승인 (admin+)
POST   /api/users/:id/reject            가입 거절 (admin+)
POST   /api/users/:id/toggle-active     계정 활성/비활성 토글 (admin+)

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
GET    /api/evals/my-history            내 목표 승인 이력 전체
GET    /api/evals/my-mgr-pending        내가 직속 상사인 final_mgr_pending 목록

GET    /api/approvals/pending           내가 승인할 목표 목록
POST   /api/approvals/:evalId/approve   승인
POST   /api/approvals/:evalId/reject    반려
GET    /api/approvals/:evalId/history   승인 이력
GET    /api/approvals/my-history        내 승인 이력 (최종평가 포함)
PATCH  /api/approvals/:id               승인 의견 수정
DELETE /api/approvals/:id               승인 취소

GET    /api/feedback/:evalId            피드백 목록 (승인자 체인 전체 열람 가능)
POST   /api/feedback/:evalId            피드백 제출

GET    /api/final/:evalId               최종 평가 조회 (승인자 체인 전체 열람 가능)
POST   /api/final/:evalId/self          자기 최종평가 제출 (self_done=1, 재제출 차단)
POST   /api/final/:evalId/mgr           상사 최종평가 확정 (1차/2차 구분, selected_grade 저장)

GET    /api/reports/:evalId             중간 보고 목록
POST   /api/reports/:evalId             중간 보고 제출
GET    /api/files/:fileId               파일 다운로드

GET    /api/eval-periods                전체 평가 기간 목록
GET    /api/eval-periods/active         활성 기간만 조회
POST   /api/eval-periods                기간 추가 (admin+)
PATCH  /api/eval-periods/:id/toggle     활성/비활성 토글 (admin+)
DELETE /api/eval-periods/:id            기간 삭제 (master)

GET    /api/grade-criteria              등급 기준 목록
POST   /api/grade-criteria              등급 추가 (admin+)
PUT    /api/grade-criteria/:id          등급 수정 (admin+)
DELETE /api/grade-criteria/:id          등급 삭제 (admin+, 최소 2개 유지)

GET    /api/settings/approval-edit      승인 수정/취소 허용 설정
POST   /api/settings/approval-edit      승인 수정/취소 설정 변경 (admin+)
GET    /api/settings/history-visibility 이력 공개 설정
POST   /api/settings/history-visibility 이력 공개 설정 변경 (admin+)
GET    /api/settings/feedback-limit     피드백 횟수 제한
POST   /api/settings/feedback-limit     피드백 횟수 제한 설정 (admin+)
GET    /api/settings/history-inactive   비활성 기간 이력 공개 설정
POST   /api/settings/history-inactive   비활성 기간 이력 공개 설정 변경 (admin+)
GET    /api/settings/second-final       2차 최종평가 허용 설정
POST   /api/settings/second-final       2차 최종평가 허용 설정 변경 (admin+)
GET    /api/settings/timezone           시간대 조회
POST   /api/settings/timezone           시간대 변경 (master)
GET    /api/settings/dashboard-depth     대시보드 계층 설정 조회
POST   /api/settings/dashboard-depth    대시보드 계층 설정 변경 (admin+)
GET    /api/perf/my-summary             내 성과 요약
GET    /api/perf/team-summary           팀 성과 요약 (조직장)
POST   /api/perf/ai-summary             AI 성과 요약 생성
GET    /api/settings/session-policy      세션 정책 조회
POST   /api/settings/session-policy     세션 정책 설정 (master)
GET    /api/notice                       공지사항 조회 (인증 불필요)
POST   /api/notice                       공지사항 수정 (admin+, 감사로그)
GET    /api/organizations                조직 목록 (계층 포함)
POST   /api/organizations                조직 추가 (admin+)
PUT    /api/organizations/:id            조직 수정 (admin+)
DELETE /api/organizations/:id            조직 삭제 (master)
GET    /api/organizations/:id/members    조직 멤버 조회
PATCH  /api/users/:id/org               사용자 조직 변경 (admin+)
GET    /api/eval-periods/my-modes        활성 기간별 내 평가방식 목록
GET    /api/eval-periods/:id/eval-mode  기간 전사 기본방식 조회 (admin+)
POST   /api/eval-periods/:id/eval-mode  기간 전사 기본방식 설정 (admin+)
GET    /api/eval-periods/:id/org-modes  기간 조직별 방식 조회 (admin+)
POST   /api/eval-periods/:id/org-modes  기간 조직별 방식 설정 (admin+)
POST   /api/eval-periods/:id/lock       기간 방식 잠금 (admin+)
GET    /api/settings/my-eval-mode       내 평가 방식 조회 (조직장 상속)
POST   /api/settings/team-eval-mode     조직장이 팀 평가 방식 설정
GET    /api/settings/eval-mode          전사 기본 평가 방식 조회
POST   /api/settings/eval-mode          전사 기본 평가 방식 변경 (admin+)
PATCH  /api/users/:id/eval-mode         특정 사용자 평가 방식 설정 (admin+)
GET    /api/okr                         내 OKR 목록
POST   /api/okr                         OKR 생성
POST   /api/okr/:id/progress            OKR 달성률 업데이트

GET    /api/admin/eval-status           전직원 평가 현황 (기간 필터)
POST   /api/admin/eval/:evalId/force-phase  평가 단계 강제 변경 (admin+)
GET    /api/admin/audit                 감사 로그 최근 200건 (admin+)
POST   /api/admin/final/:id/unlock      최종 평가 잠금 해제 (master)
```

---

## 알려진 버그 및 미완성 항목

### 🔴 버그 (수정 완료)
- [x] `cancelApproval()` — API 미호출 버그 수정 (2026-04-30)
- [x] `PATCH /api/users/:id` — manager_id null 처리 수정 (2026-04-30)
- [x] Stars `data-goal-id` — dead attributes 제거 (2026-04-30)
- [x] 최종 점수 계산 — 카테고리 가중치 미반영 수정 (2026-04-30)
- [x] `renderCatBlock` — 목표 추가 시 카테고리 순서 초기화 버그 수정 (2026-04-30)
- [x] `saveDraftGoals`/`submitGoals` — 임시저장·승인요청 500 오류 수정 (2026-04-30)
- [x] `GET /api/users/signup-requests` 라우트 순서 버그 수정 (2026-04-30)
- [x] `renderAdmAccounts` 배열 방어 누락 수정 (2026-04-30)
- [x] 중간 피드백 이중 표시 — renderGiveFeedback 이중 호출 제거 (2026-05-01)
- [x] 같은 직원 여러 기간 eval 모두 표시 — 직원별 최신 eval 1개만 표시 (2026-05-01)
- [x] 승인 finalApproved 계산 오류 — approvedLevels로 모든 레벨 체크 (2026-05-01)
- [x] 자기평가 재제출 가능 — INSERT 시 self_done=1 누락 수정 (2026-05-04)
- [x] 최종평가 뱃지 혼재 — 모두 '최종평가 대기'로 통일 (2026-05-04)
- [x] 상사 최종평가 완료 후 버튼 계속 활성화 — mgr_done=1 시 잠금 화면 표시 (2026-05-04)

### 🟡 미완성 기능
- [ ] 비밀번호 변경 기능
- [ ] 동일 기간 중복 평가 방지
- [ ] 평가 결과 Excel/PDF 출력
- [ ] 이메일 알림
- [ ] 목표 수정 시 버전 이력 관리

### 🟢 운영 서버 전환 시 (보안 강화 — 필수)
- [ ] ENC_SECRET, JWT_SECRET → .env 파일 분리
- [ ] AES-256-CBC → AES-256-GCM 업그레이드
- [ ] SQLite → PostgreSQL 교체
- [ ] HTTPS 적용
- [ ] 본인인증 추가 (이메일/SMS/SSO 방식 미결정)
- [ ] 프론트엔드 React 전환
- [ ] Docker 컨테이너화

---

## 개발 이력

| 날짜 | 작업 내용 | 작업자 |
|------|-----------|--------|
| 2026-05-12 | 드롭다운 텍스트 표시 수정, 모바일 아코디언 애니메이션 추가 | Claude Code |
| 2026-05-12 | 드롭다운 메뉴 z-index 및 배경색 수정 (z-index:9999, background:white !important) | Claude Code |
| 2026-05-12 | PC 헤더 메뉴 수평 중앙 정렬 (nav topbar 내부 이동, position absolute 중앙) | Claude Code |
| 2026-05-12 | perfHome/okrDashboard navigate 미등록 수정 (var Pages 초기화, navigate 직접 처리 추가) | Claude Code |
| 2026-05-12 | perfHome/okrDashboard 빈 캔버스 수정 (이미 등록됨 확인, 추가 불필요) | Claude Code |
| 2026-05-12 | PC 메뉴 미표시 + 모바일 첫화면 공백 수정 | Claude Code |
| 2026-05-12 | 30-31 디버깅: 메뉴 탭, 빈캔버스, 햄버거 홈 항목 수정 | Claude Code |
| 2026-05-12 | 30번 디버깅: 메뉴 탭 미표시, null 참조 오류 수정 | Claude Code |
| 2026-05-12 | 성과관리 홈 대시보드 (역할별 뷰, 기간별 차트, AI 요약, 계층 설정) | Claude Code |
| 2026-05-12 | PC 드롭다운 메뉴(0.15s 슬라이드 애니), 성과관리 메뉴, OKR 현황, 세션 보안 정책 | Claude Code |
| 2026-05-12 | PC 드롭다운 메뉴 (내평가/성과관리/관리자설정), OKR 현황 대시보드 추가 | Claude Code |
| 2026-05-12 | 햄버거 메뉴 1레벨 탭이동/아코디언 분리, 로그인 공지사항 기능 추가 (DB마이그레이션, 감사로그) | Claude Code |
| 2026-05-12 | 모바일 햄버거 메뉴 재설계 (아코디언 2레벨, 사용자정보 메뉴 상단 이동) | Claude Code |
| 2026-05-12 | 반응형 UI 추가 (모바일 햄버거 메뉴, 버튼 줄바꿈 방지, 768px/480px 미디어쿼리) | Claude Code |
| 2026-05-12 | 조직관리 멤버 표시 타입 불일치 수정, 강영업 org_id 배정 | Claude Code |
| 2026-05-12 | my-modes API MBO 제외 조건 추가, eval_period_modes 잘못된 데이터 정리 | Claude Code |
| 2026-05-12 | organizations 테이블 추가 (계층구조, 조직장, 멤버), org_id 기반 평가방식 조회 | Claude Code |
| 2026-05-12 | _currentPeriodLabel 중복 선언 제거 (SyntaxError 수정) | Claude Code |
| 2026-05-12 | okr-eval.js API 경로 확인 (/okr 유지, api.js base='/api'로 자동 prefix됨 — 수정 불필요) | Claude Code |
| 2026-05-12 | okr-eval.js 스크립트 로딩 순서 수정 (app.js를 api.js 직후로 이동, Pages 객체 먼저 정의) | Claude Code |
| 2026-05-12 | OKR 작성하기 버튼 작동 버그 수정 (빈 중간 화면 제거 → 바로 작성 폼으로 이동) | Claude Code |
| 2026-05-12 | 평가기간별 평가방식 분기 (OKR/KPI기간→OKR버튼, MBO기간→MBO버튼) | Claude Code |
| 2026-05-11 | OKR 모드 개선: 다중 활성기간 OKR 우선적용, MBO 카드 숨김 | Claude Code |
| 2026-05-11 | my-eval OKR 배너 source 레이블 수정 (manager/self → org_period/period/global), 레이아웃 개선 | Claude Code |
| 2026-05-11 | my-eval-mode 계층 탐색 버그 수정 (직속 상사 1단계만 조회 → 최대 5단계 상위 탐색으로 수정) | Claude Code |
| 2026-05-11 | 평가방식 3차원 매핑 (조직×기간×방식), eval_period_modes 테이블, 기간별 잠금 기능 | Claude Code |
| 2026-05-11 | 관리자 평가방식 선택 UI 누락 수정 (Promise.all/버튼/함수 모두 정상 확인) | Claude Code |
| 2026-05-11 | 평가 방식 변경 잠금 로직 추가 (진행 중 eval 차단, master 경고 허용), 전사 기본값 안내 문구 추가 | Claude Code |
| 2026-05-11 | OKR 평가 방식 추가 - 조직도 기반 부서별 설정, okr-eval.js 신규 생성 | Claude Code |
| 2026-05-11 | .gitignore에 .env 추가 (보안 강화 사전 준비) | Claude Code |
| 2026-05-08 | 시스템 시간대 설정 기능 추가 (관리자 설정 - 평가정책, app_settings 기반) | Claude Code |
| 2026-05-08 | my-eval evs.filter 방어코드 추가 | Claude Code |
| 2026-05-07 | 2차 최종평가 DB 저장 버그 수정 | Claude Code |
| 2026-05-07 | 2차 평가자 등급선택 검증 제외 수정 (submitFinalMgr) | Claude Code |
| 2026-05-07 | final_mgr2_pending 탭 표시 조건 추가, 2차 제출 버튼 연결 수정 | Claude Code |
| 2026-05-07 | flowBar 단계 표시 수정 (phase 기반 완료 단계 올바르게 계산) | Claude Code |
| 2026-05-07 | my-eval phaseLabels에 final_mgr2_pending 추가 (이미 적용됨 확인) | Claude Code |
| 2026-05-07 | 최종평가 잠금해제 시 self_done/mgr_done/별점 완전 초기화, phase=final_self로 복구 | Claude Code |
| 2026-05-06 | 2차 평가자 별점 입력 추가, 승인이력/완료화면에 자기/1차/2차 별점 모두 표시 | Claude Code |
| 2026-05-06 | 승인이력 자기/1차/2차 평가결과 표시, 관리자 평가단계 강제변경 버튼 추가 | Claude Code |
| 2026-05-06 | 최종평가 완료 후 뱃지 '1차/2차 평가 완료'로 표시 수정 | Claude Code |
| 2026-05-06 | 과거이력 final_mgr2_pending 라벨 누락 수정 | Claude Code |
| 2026-05-06 | 중간보고 goals is not defined 버그 수정 | Claude Code |
| 2026-05-06 | 조직도 차트 연결선 및 자동배치 수정 | Claude Code |
| 2026-05-06 | 조직도 차트 데이터 연결 수정 (전체 조직원 표시 및 연결선 복구) | Claude Code |
| 2026-05-06 | 조직도 차트방식 복구 (outputs 파일 덮어쓰기로 인한 손실) | Claude Code |
| 2026-05-04 | 가입신청/승인 화면에 직급 입력란 추가 | Claude Code |
| 2026-05-04 | 가입승인 버튼 초기 활성화 (조직설정 없이도 바로 승인 가능) | Claude Code |
| 2026-05-04 | 최종평가 등급선택 UI: select드롭다운→카드테이블 방식으로 변경 (순위/코드/명칭/설명/비고 표시) | Claude Code |
| 2026-05-04 | 평가등급 설명란 input→textarea 변경 (다중행 입력 지원) | Claude Code |
| 2026-05-04 | 2차최종평가 순서제어 완성: goalsSection/별점 2차숨김, submitFinalMgr is_second:true, my-mgr-pending final_done제거 | Claude Code |
| 2026-05-04 | 최종평가 등급선택 복구(1차/2차 모두), second_selected_grade 저장, submitFinalMgr 통합 | Claude Code |
| 2026-05-04 | /api/evals/my-history API 누락 추가 (과거 목표승인 이력 버그 수정) | Claude Code |
| 2026-05-04 | 2차최종평가 순서제어 완성 (1차완료→2차활성화, phase전환, 잠금처리) | Claude Code |
| 2026-05-04 | 최종평가 뱃지 '최종평가 대기'로 통일 | Claude Code |
| 2026-05-04 | 최종평가 뱃지 오류 수정, mgr_done 완료 후 잠금 표시, 재제출 방지 | Claude Code |
| 2026-05-04 | 상사최종평가 등급선택 드롭다운 추가, selected_grade DB저장, 완료화면 등급표시 | Claude Code |
| 2026-05-04 | 승인이력조회수정, 자기평가재제출방지, 승인이력최종평가표시, 계정승인비활성화, 중간보고목표별, 등급삭제수정+순위열, 최종평가등급선택 | Claude Code |
| 2026-05-04 | 조직도차트방식복귀, 과거이력toggleHistoryPanel추가, 최종평가등급기준관리탭신규(grade_criteria) | Claude Code |
| 2026-05-04 | 평가기간관리탭(adm-periods) 추가, 2차최종평가설정(second-final) 추가 | Claude Code |
| 2026-05-04 | GitHub 연동 완료 (jeremydev99/hrmanage, Public, push alias 설정) | 사용자 |
| 2026-05-01 | 피드백열람권한확장(체인전체), 별점시각화개선, 최종평가상호열람, 중간피드백별점요약 | Claude Code |
| 2026-05-01 | 피드백중복버그수정, 중간보고-피드백연동, 직급전체화면반영, 최종평가textarea너비수정 | Claude Code |
| 2026-05-01 | 조직도차트방식 재구현(목록/차트전환, 전체화면, 저장), 직급(grade) 필드 추가 | Claude Code |
| 2026-05-01 | 승인이력조회/수정/취소, 조직도중앙정렬, 부서직책편집, 전직원현황조직필터, 승인편집정책 | Claude Code |
| 2026-05-01 | 조직도차트 드래그개선, 피드백UI, 전직원현황사람별조회, 정책설정개선 | Claude Code |
| 2026-05-01 | 전직원 평가 현황 기간 필터, 부서별 진행률 바, 미시작 직원 표시 | Claude Code |
| 2026-05-01 | 관리자 평가 단계 강제 변경 기능 추가 | Claude Code |
| 2026-05-01 | 멀티기간 목표승인 기능 추가 (eval_periods 테이블, 기간관리탭) | Claude Code |
| 2026-05-01 | 승인버그수정, 조직도차트방식추가, 과거이력탭, 이력공개설정, 평가정책탭 추가 | Claude Code |
| 2026-04-30 | 라우트순서버그·임시저장500·renderAdmAccounts배열방어 수정, 전직원평가현황대시보드 추가 | Claude Code |
| 2026-04-30 | 신규가입신청·계정승인, 카테고리순서유지, textarea UI, 임시저장500오류 수정 | Claude Code |
| 2026-04-30 | VS Build Tools 설치, data/ 디렉토리 생성, 서버 구동 확인 | Claude Code |
| 2026-04-30 | 버그 4건 수정: cancelApproval API, manager_id null, Stars 정리, 최종점수 가중치 | Claude Code |
| 2026-04-30 | CLAUDE.md v2 작성 | 사용자 |
| 2025-04-30 | Phase 1~7 전체 설계 및 로컬 테스트 버전 v1.0 완성 | Claude.ai |

---

## Claude Code 작업 체크리스트

### 작업 시작 전
```
1. CLAUDE.md의 "알려진 버그" 및 "미완성 기능" 섹션 확인
2. 영향받는 파일 파악 (파일 구조 섹션 참고)
3. API 변경 여부 확인 (API 엔드포인트 목록 참고)
```

### 작업 완료 후 (필수)
```
1. 완료된 버그/기능 → [ ] → [x] 체크
2. 새로 발견한 버그 → 🔴 섹션에 추가
3. 추가된 API → 엔드포인트 목록에 추가
4. 새 파일/함수 → 파일 구조 또는 기술 스택 섹션 업데이트
5. 개발 이력 테이블 맨 위에 한 줄 추가 (날짜 | 내용 | Claude Code)
```

---

## Claude Code 프롬프트 템플릿

### 템플릿 A — 버그 수정
```
CLAUDE.md의 알려진 버그 중 아래 항목을 수정해줘:
- [버그 항목]

완료 후 CLAUDE.md 업데이트:
- 해당 항목 [x] 처리
- 새로 발견한 버그 있으면 추가
- 개발 이력에 오늘 날짜 + 수정 내용 + "Claude Code" 추가
```

### 템플릿 B — 새 기능 추가
```
다음 기능을 추가해줘:
[기능 설명]

완료 후 CLAUDE.md 업데이트:
- 미완성 기능 해당 항목 [x] 처리
- 추가된 API 엔드포인트 목록에 추가
- 새 파일/함수 구조 섹션 업데이트
- 개발 이력에 오늘 날짜 + 내용 + "Claude Code" 추가
```

### 템플릿 C — 자유 작업
```
[작업 내용]

완료 후 반드시 CLAUDE.md 업데이트:
- 완료 항목 [x] 처리
- 새 버그/결정사항 해당 섹션에 추가
- 개발 이력에 오늘 날짜 + 작업 내용 + "Claude Code" 추가
```
