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
│   └── index.js               ← 메인 서버 전체 (API + DB초기화 + 암호화 + 시드데이터, ~570줄)
├── public/
│   ├── index.html             ← SPA 진입점 (스크립트 로딩 순서 중요: api→app→components→pages)
│   ├── css/
│   │   └── style.css          ← 오렌지 테마 CSS 변수 (--o50~--o800) + 전체 스타일
│   └── js/
│       ├── api.js             ← fetch 래퍼 (API.get/post/put/patch/del, Bearer 토큰 자동 첨부)
│       ├── app.js             ← SPA 라우터, App 전역 객체 (App.user, App.categories, App.navigate)
│       ├── components.js      ← 공통 UI 컴포넌트 + 유틸 함수
│       └── pages/
│           ├── login.js       ← 로그인 화면
│           ├── my-eval.js     ← 목표 설정 + 승인 요청 + 평가 현황 (가장 복잡한 파일)
│           ├── approvals.js   ← 목표 승인 관리 (승인자용)
│           ├── feedback.js    ← 중간 피드백 (받기 + 주기)
│           ├── final-eval.js  ← 최종 평가 (자기평가 + 상사평가 + 결과 보기)
│           └── admin.js       ← 관리자 설정 (카테고리/조직도/권한/감사로그)
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
- **`cancelApproval()` 수정**: 기존에는 API 호출 없이 화면만 전환. `POST /api/evals/:id/cancel` 신규 엔드포인트 추가, 프론트에서 실제 호출하도록 수정. 취소 시 phase→draft, goals status→draft, goal_approvals 레코드 삭제(재제출 시 승인 흐름 초기화).
- **`manager_id=null` PATCH 버그 수정**: `manager_id !== undefined` 체크를 `'manager_id' in req.body`로 변경. 명시적 null 전송 시 NULL 저장, 미전송 시 기존값 보존 로직 명확화.
- **Stars `data-goal-id` 정리**: `renderFinalSelf`, `renderFinalMgr`에서 사용하지 않던 dead attributes(`dataset.goalId2`, `dataset.evalId`) 제거. Stars()가 이미 data-goal-id를 정확히 세팅하므로 중복 불필요.
- **최종 점수 계산 카테고리 가중치 반영**: 서버(`POST /api/final/:evalId/mgr`)의 점수 계산에 goal_categories JOIN 추가, 카테고리별 목표 가중치 정규화 후 카테고리 가중치(%) 적용. `calcFinalScore()` 헬퍼 함수를 components.js에 추가하여 프론트엔드(my-eval.js, final-eval.js) 점수 표시도 동일 로직 적용.
- **VS Build Tools + npm install**: Node.js v24에서 better-sqlite3 prebuild 없음 → VS Build Tools 2022(C++ 워크로드) 설치로 해결. data/ 디렉토리 생성 후 서버 정상 구동 확인.

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
final_evaluations:  self_note, mgr_note
```

### 프론트엔드 전역 객체
```javascript
API       — fetch 래퍼 (api.js): API.get/post/put/patch/del
App       — 라우터/상태 (app.js)
            App.user          현재 로그인 사용자 {id, name, email, role, dept, title}
            App.categories    목표 카테고리 배열 (로그인 후 전역 캐시)
            App.navigate(id)  페이지 전환
            App.isAdmin()     master 또는 admin 여부
Pages     — 페이지 렌더러: Pages.login / myEval / approvals / feedback / finalEval / admin
```

### 공통 컴포넌트 함수 (components.js)
```javascript
// DOM 엘리먼트 반환 (innerHTML 아님!)
Stars(goalId, ctx, initial, onChange)
  → data-goal-id="{goalId}", data-ctx="{ctx}", data-value="{현재값}" 을 가진 div 반환
  → 별 클릭 시 data-value 자동 갱신
flowBar(phase) → 평가 단계 진행바 DOM 반환

// HTML 문자열 반환
badge(text, cls)              → <span class="bd bd-{cls}">
phaseBadge(phase)             → 단계명 badge
roleBadge(role)               → 권한명 badge
scoreLabel(score)             → '미달성'~'탁월' (1~5 → 문자열)
gradeEl(grade)                → <span class="grade grade-{g}">
renderGoalsSummary(goals, categories) → 목표 목록 HTML

// 유틸
showAlert(msg, type, container) → void (3.5초 후 자동 소멸)
el(tag, attrs, ...children)     → DOM 엘리먼트 생성 헬퍼
html(str)                       → HTML 문자열 → 첫 번째 DOM 엘리먼트

// 점수 계산 (v1.1 추가)
calcFinalScore(goals, scores)
  → 카테고리 가중치 반영 최종 점수 계산
  → scores: { goalId: { mgr_score, self_score } }
  → App.categories의 weight(%) × 카테고리 내 목표 가중치 정규화 후 합산
  → 반환: 소수점 1자리 숫자
```

### DB 스키마 (server/index.js initDB()에서 자동 생성)
```sql
users              id, name, email, password_hash, role, dept, grade, title, manager_id, is_active, account_status, signup_note
grade_criteria     id, grade_code, grade_name, description, note, sort_order, is_active
final_evaluations  ... selected_grade TEXT (추가 - 평가자가 선택한 등급 코드)
audit_logs         id, user_id, action, ip, created_at
goal_categories    id, name, description, weight, color, text_color, sort_order, is_active, created_by
eval_cycles        id, user_id, period_type, period_label, eval_year, phase, self_reason(암호화), locked
goals              id, eval_id, category_id, name(암호화), kpi(암호화), weight, sort_order, status
goal_approvals     id, eval_id, approver_id, level, action, note(암호화)
feedbacks          id, eval_id, author_id, overall_note(암호화)
feedback_items     id, feedback_id, goal_id, score, note(암호화)
final_evaluations  id, eval_id, self_note(암호화), self_done, mgr_note(암호화), mgr_done,
                   mgr_approver_id, final_score, final_grade, locked
final_eval_scores  id, final_id, goal_id, self_score, mgr_score
```

---

## 조직도 및 테스트 계정

```
이대표 (대표이사) [master]  ceo@synapsoft.com  / admin1234
├── 김인사 (인사팀장) [master]  hr1@synapsoft.com  / admin1234
│   └── 박인사 (인사팀원) [admin]   hr2@synapsoft.com  / admin1234
├── 최개발 (개발팀장) [user]    dev1@synapsoft.com / user1234
│   └── 정개발 (시니어)  [user]    dev2@synapsoft.com / user1234
│       └── 한개발 (주니어) [user]    dev3@synapsoft.com / user1234
├── 오영업 (영업팀장) [user]    sales1@synapsoft.com / user1234
│   └── 강영업 (영업사원) [user]    sales2@synapsoft.com / user1234
```

---

## 핵심 설계 원칙 (변경 금지)

1. **조직도 = 승인 체계**: `users.manager_id` 재귀 쿼리로 자동 결정, 별도 승인자 테이블 없음
2. **최종 평가 잠금**: `locked=1` 후 master/admin만 `POST /api/admin/final/:id/unlock`으로 해제 가능
3. **데이터 암호화**: 목표명·KPI·피드백·평가 의견은 반드시 `encrypt()` 후 저장
4. **권한 UI 분리**: 관리자 탭은 master/admin만 표시, user에게 탭 자체가 없음
5. **중간 피드백 무제한**: 횟수 제한 없이 언제든 `POST /api/feedback/:evalId` 가능
6. **용어 통일**: "중간 평가" 아님, 반드시 **"중간 피드백"** 으로 표기
7. **점수 계산**: 카테고리 가중치 × (카테고리 내 목표 가중치 정규화) — `calcFinalScore()` 사용
8. **중간 피드백 의무**: 1차 직속 상사는 의무, 2차 이상 승인자는 선택
9. **조직도 차트**: 위치 기반 상/하 관계 자동 인식 (위=상위, 아래=하위), 배치는 💾 저장 버튼 클릭 시 localStorage 저장
10. **승인 수정/취소**: `approval_edit` 설정이 켜진 경우만 승인자 본인이 취소/의견수정 가능
11. **직급(grade)**: 사원~사장 선택 또는 직접입력, `users.grade` 컬럼, 조직도 노드 및 승인 체계 표시에 포함
12. **피드백 열람**: 승인자 체인 전체가 하위 승인자의 피드백 열람 가능
13. **최종평가 열람**: 승인자 체인 전체가 열람 가능 (작성은 1차 직속 상사만)
14. **중간 피드백 별점**: 목표별 1~5점, 최종평가 화면에서 요약 표시, `renderStars()`/`renderFeedbackStarSummary()` 전역 함수

---

## 평가 사이클 플로우

```
피평가자 목표 작성 (카테고리별, 가중치 합 100% 강제)
    ↓ POST /api/evals/:id/submit
[phase: pending] N단계 순차 승인 (조직도 기반 자동)
    ↓ POST /api/approvals/:id/approve   (반려 시 → draft)
    ↑ POST /api/evals/:id/cancel        (취소 시 → draft, approvals 삭제)
[phase: approved] 목표 확정 — 중간 피드백 무제한
    ↓ POST /api/final/:id/self
[phase: final_mgr_pending] 자기 최종평가 완료
    ↓ POST /api/final/:id/mgr  → locked=1 자동 설정
[phase: final_done] 평가 완료 및 잠금
```

---

## API 엔드포인트 목록

```
POST   /api/auth/login                  로그인 (JWT 발급)
GET    /api/auth/me                     내 정보

GET    /api/users                       전체 사용자 목록 (auth)
POST   /api/users                       사용자 추가 (admin+)
PATCH  /api/users/:id                   사용자 수정 (admin+) — manager_id:null 가능
GET    /api/users/:id/approvers         승인자 체인 조회 → { approvers[], directManagerId } ★v1.4

GET    /api/categories                  카테고리 목록
POST   /api/categories                  카테고리 추가 (admin+)
PUT    /api/categories/:id              카테고리 수정 (admin+)
DELETE /api/categories/:id              카테고리 삭제=비활성화 (master)

GET    /api/evals                       평가 목록 (본인+부하직원, admin은 전체)
POST   /api/evals                       평가 사이클 생성
GET    /api/evals/:id/goals             목표 목록 (복호화 포함, 권한 체크)
POST   /api/evals/:id/goals             목표 저장 (암호화, draft/pending 상태만)
POST   /api/evals/:id/submit            승인 요청 제출 (draft → pending)
POST   /api/evals/:id/cancel            승인 요청 취소 (pending → draft, approvals 삭제) ★v1.1

POST   /api/auth/signup                 가입 신청 (인증 불필요) ★v1.2
GET    /api/users/signup-requests       가입 신청 목록 — pending/rejected (admin+) ★v1.2
POST   /api/users/:id/approve           가입 승인 — role/dept/title/manager_id 설정 (admin+) ★v1.2
POST   /api/users/:id/reject            가입 거절 (admin+) ★v1.2
POST   /api/users/:id/toggle-active     계정 활성/비활성 토글 (admin+) ★v1.2

GET    /api/approvals/pending           내가 승인할 목표 목록
POST   /api/approvals/:evalId/approve   승인 (모든 단계 완료 시 approved 전환)
POST   /api/approvals/:evalId/reject    반려 (draft로 복귀)
GET    /api/approvals/:evalId/history   승인 이력

GET    /api/feedback/:evalId            피드백 목록 (복호화 포함)
POST   /api/feedback/:evalId            피드백 제출 (approved/final_self/final_mgr_pending만)

GET    /api/final/:evalId               최종 평가 조회 (scores 배열 포함)
POST   /api/final/:evalId/self          자기 최종평가 제출 → final_mgr_pending 전환
POST   /api/final/:evalId/mgr           상사 최종평가 확정 → locked=1, final_done 전환 ★카테고리 가중치 반영

GET    /api/admin/eval-status?period_label=&eval_year=  전직원 평가 현황 (기간 필터 지원, has_eval 포함) ★v1.7
GET    /api/admin/eval-detail/:userId   특정 직원 평가 상세 — 목표/승인이력/피드백/최종평가 (admin+) ★v1.3
GET    /api/eval-periods                 전체 평가 기간 목록 ★v1.5
GET    /api/eval-periods/active          활성화된 기간만 조회 (직원용) ★v1.5
POST   /api/eval-periods                 기간 추가 (admin+) ★v1.5
PATCH  /api/eval-periods/:id/toggle      활성/비활성 토글 (admin+) ★v1.5
DELETE /api/eval-periods/:id             기간 삭제 (master, eval 없을 때만) ★v1.5

GET    /api/evals/my-history             내 목표 승인 이력 전체 (goals+approvals 포함) ★v1.4
GET    /api/approvals/my-history          내 승인 이력 (기간 필터) ★v1.9
PATCH  /api/approvals/:id                승인 의견 수정 (설정 허용 시) ★v1.9
DELETE /api/approvals/:id                승인 취소 (설정 허용 시) ★v1.9
GET    /api/settings/approval-edit       승인 수정/취소 허용 설정 ★v1.9
POST   /api/settings/approval-edit       승인 수정/취소 설정 변경 (admin+) ★v1.9

GET    /api/evals/my-history             내 목표 승인 이력 전체 (goals+approvals 포함) ★v1.9
GET    /api/grade-criteria              등급 기준 목록 ★v1.9
POST   /api/grade-criteria              등급 추가 (admin+) ★v1.9
PUT    /api/grade-criteria/:id          등급 수정 (admin+) ★v1.9
DELETE /api/grade-criteria/:id          등급 비활성화 (master) ★v1.9

GET    /api/settings/history-visibility  이력 공개 설정 조회 ★v1.4
POST   /api/settings/history-visibility  이력 공개 설정 변경 (admin+) ★v1.4
GET    /api/settings/feedback-limit      피드백 횟수 제한 조회 ★v1.8
POST   /api/settings/feedback-limit      피드백 횟수 제한 설정 (admin+) ★v1.8
GET    /api/settings/history-inactive    비활성 기간 이력 공개 설정 조회 ★v1.8
POST   /api/settings/history-inactive    비활성 기간 이력 공개 설정 변경 (admin+) ★v1.8
POST   /api/admin/eval/:evalId/force-phase  평가 단계 강제 변경 (admin+) ★v1.6
GET    /api/admin/audit                 감사 로그 최근 200건 (admin+)
POST   /api/admin/final/:id/unlock      최종 평가 잠금 해제 (master)
```

---

## 알려진 버그 및 미완성 항목

### 🔴 버그 (수정 완료)
- [x] `cancelApproval()` — API 미호출 버그. `POST /api/evals/:id/cancel` 추가 및 실제 호출로 수정 (2026-04-30)
- [x] `PATCH /api/users/:id` — `manager_id=null` 처리. `'manager_id' in req.body` 체크로 변경 (2026-04-30)
- [x] Stars `data-goal-id` — `renderFinalSelf`/`renderFinalMgr`의 dead attributes 제거 (2026-04-30)
- [x] 최종 점수 계산 — 카테고리 가중치 미반영. `calcFinalScore()` 추가 및 서버/프론트 모두 수정 (2026-04-30)
- [x] `renderCatBlock` — 목표 추가 시 카테고리 순서 초기화 버그. `replaceChild`/`insertBefore`로 순서 유지 (2026-04-30)
- [x] `saveDraftGoals`/`submitGoals` — 임시저장·승인요청 500 오류. `saveOrCreateEval`에서 approved 제외 필터, phase/period 유효성 검사, null 방어 강화 (2026-04-30)
- [x] `GET /api/users/signup-requests` 라우트 순서 버그 — `:id` 라우트보다 뒤에 위치 → `signupReqs.filter is not a function`. `/api/users/:id/approvers` 바로 앞으로 이동, `Array.isArray` 방어 추가 (2026-04-30)
- [x] `renderAdmAccounts` 배열 방어 누락 — 응답이 배열이 아닐 때 `.filter` 오류. `Array.isArray` 체크 추가, `toggleActive` 파라미터 정리 (2026-04-30)
- [x] 중간 피드백 이중 표시 — `renderGiveFeedback` 이중 호출 제거 (2026-05-01)
- [x] 같은 직원 여러 기간 eval 모두 표시 — 직원별 최신 eval 1개만 표시하도록 deduplicate (2026-05-01)
- [x] 승인 finalApproved 계산 오류 — `doneCount >= chain.length`가 레벨 불일치 시 미확정. `approvedLevels`로 모든 레벨 체크 (2026-05-01)
- [x] `GET /api/users/:id/approvers` — 응답이 배열에서 `{ approvers, directManagerId }` 객체로 변경, 프론트 방어 처리 추가 (2026-05-01)

### 🟡 미완성 기능
- [x] 신규 가입 신청 및 계정 승인 관리 (로그인 화면 가입 신청 버튼, 관리자 승인/거절/재승인/활성토글) (2026-04-30)
- [x] 관리자용 전체 직원 평가 현황 대시보드 — 부서별 단계 요약 + 개인 상세(목표/승인이력/피드백/최종점수) (2026-04-30)
- [x] 조직도 차트 방식 (드래그앤드롭) + 목록 방식 듀얼 모드 (2026-05-01)
- [x] 멀티 기간 평가 관리 — 기간별 독립 eval_cycle, 활성 기간 선택 후 시작, 기간별 카드 표시 (2026-05-01)
- [x] 관리자 평가 기간 활성/비활성 제어 — eval_periods 테이블, 기간 관리 탭 추가 (2026-05-01)
- [x] 동일 기간 중복 평가 방지 (period_label+eval_year 기준으로 중복 체크) (2026-05-01)
- [x] 과거 목표승인 이력 조회 — 내 평가 탭 하단 펼치기 패널 (2026-05-01)
- [x] 이력 공개 On/Off 설정 — 관리자 설정 > 평가 정책 탭 (2026-05-01)
- [ ] 비밀번호 변경 기능 (현재 관리자가 DB 직접 수정해야 함)
- [ ] 동일 기간 중복 평가 방지 (같은 user_id + period_label 중복 생성 가능)
- [ ] 평가 결과 Excel/PDF 출력
- [ ] 이메일 알림 (승인 요청, 피드백 도착, 최종 평가 완료)
- [ ] 목표 수정 시 버전 이력 관리
- [ ] `npm run dev` 스크립트 없음 (nodemon 미설치 — 필요 시 `npm i -D nodemon` 후 추가)

### 🟢 운영 서버 전환 시
- [ ] SQLite → PostgreSQL 교체 (better-sqlite3 → pg)
- [ ] AES-256-CBC → AES-256-GCM 업그레이드
- [ ] 하드코딩 ENC_SECRET, JWT_SECRET → .env 파일 분리
- [ ] 프론트엔드 React 전환
- [ ] Docker 컨테이너화
- [ ] HTTPS 적용 (Traefik + Let's Encrypt)

---

## 개발 이력

| 날짜 | 작업 내용 | 작업자 |
|------|-----------|--------|
| 2026-05-04 | 2차최종평가 순서제어 완성 (1차완료→2차활성화, phase전환, 잠금처리) | Claude Code |
| 2026-05-04 | 최종평가 뱃지 '최종평가 대기'로 통일 | Claude Code |
| 2026-05-04 | 최종평가 뱃지 오류 수정, mgr_done 완료 후 잠금 표시, 재제출 방지, final_done 목록 제거 | Claude Code |
| 2026-05-04 | 상사최종평가 등급선택 드롭다운 추가, selected_grade DB저장, 완료화면 등급표시 수정 | Claude Code |
| 2026-05-04 | 승인이력조회수정, 자기평가재제출방지, 승인이력최종평가표시, 계정승인비활성화, 중간보고목표별, 등급삭제수정+순위열, 최종평가등급선택 | Claude Code |
| 2026-05-04 | 조직도차트방식복귀(목록/차트전환), 과거이력toggleHistoryPanel추가, 최종평가등급기준관리탭신규(grade_criteria) | Claude Code |
| 2026-05-01 | 피드백열람권한확장(체인전체), 별점시각화개선(renderStars/요약), 최종평가상호열람, 중간피드백별점요약 | Claude Code |
| 2026-05-01 | 피드백중복버그수정, 중간보고-피드백연동, 직급전체화면반영(evals/approvals JOIN+UI), 최종평가textarea너비수정 | Claude Code |
| 2026-05-01 | 조직도차트방식 완전 재구현(목록/차트전환, 전체화면, 저장버튼, 중앙정렬), 직급(grade) 필드 추가, 가입폼+수정모달 직급 UI | Claude Code |
| 2026-05-01 | 승인이력조회/수정/취소, 조직도중앙정렬/스크롤/전체화면/저장, 부서직책편집, 전직원현황조직필터, 승인편집정책 | Claude Code |
| 2026-05-01 | 조직도차트 드래그개선(위치기반연결선), 피드백UI·의무화, 전직원현황사람별조회, 정책설정개선(피드백횟수·비활성이력) | Claude Code |
| 2026-05-01 | 전직원 평가 현황 기간 필터 추가, 부서별 진행률 바, 미시작 직원 표시, 요약 카드 개선 | Claude Code |
| 2026-05-01 | 관리자 평가 단계 강제 변경 기능 추가 (전직원현황 상세화면 + ADMIN_FORCE_PHASE 감사 로그) | Claude Code |
| 2026-05-01 | 멀티기간 목표승인 기능 추가(eval_periods 테이블, 기간관리탭, Pages.myEval 기간카드 구조 개편) | Claude Code |
| 2026-05-01 | 승인버그(finalApproved레벨체크)수정, 조직도차트방식추가, 과거이력탭, 이력공개설정, 평가정책탭 추가 | Claude Code |
| 2026-04-30 | 라우트순서버그·임시저장500·renderAdmAccounts배열방어 수정, 전직원평가현황대시보드(부서별요약+개인상세) 추가 | Claude Code |
| 2026-04-30 | 수정 5건: 신규가입신청·계정승인(server+login+admin), 카테고리순서유지, textarea UI, 임시저장500오류, DB마이그레이션 | Claude Code |
| 2026-04-30 | VS Build Tools 2022 설치, data/ 디렉토리 생성, npm install + 서버 구동 확인 | Claude Code |
| 2026-04-30 | 버그 4건 수정: cancelApproval API 연동, manager_id null 처리, Stars dead attributes 정리, 최종 점수 카테고리 가중치 반영 | Claude Code |
| 2026-04-30 | CLAUDE.md v2 작성 (전체 개발 과정 + 자동 업데이트 지시사항 포함) | 사용자 |
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
