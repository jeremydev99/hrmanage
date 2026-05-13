# CLAUDE.md — Claude Code 세션 가이드

> **매 세션 시작 시 반드시**: 이 파일 읽기 → ClaudeHRM.md 읽기 → 수정할 파일 직접 확인
> **작업 완료 후 반드시**: CLAUDE.md + ClaudeHRM.md 둘 다 업데이트
> **코드 변경 작업 완료 후 반드시**: `git add . && git commit` 자동 실행 (push는 사용자가 수동)
> **커밋 메시지 규칙**: 한 줄, "작업 내용 (PROMPT_번호)" 형식. 작업번호가 없으면 작업 내용만 한 줄로
> **커밋 메시지 예시**: "사내 LLM 연동 + .env 분리 (PROMPT_34)", "시간대 Asia/Seoul로 변경"

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | ㈜사이냅소프트 인사평가 시스템 |
| 위치 | `C:\claudeprojects\hrmanage\` |
| 실행 | `실행.bat` 또는 `node server/index.js` → http://localhost:3000 |
| GitHub | https://github.com/jeremydev99/hrmanage |
| Node.js | v18 이상 (v24: VS Build Tools 필요) |

---

## 기술 스택

- **Backend**: Node.js + Express + SQLite (better-sqlite3), 단일 파일 `server/index.js`
- **Frontend**: Vanilla JS SPA (프레임워크 없음), `public/js/`
- **인증**: JWT 8h, AES-256-CBC 필드 암호화, bcryptjs
- **API Base**: `API.get('/path')` → `fetch('/api/path')` (api.js `base: '/api'`)

---

## 핵심 파일

```
server/index.js          서버 + API 전체 (~2000줄)
public/js/app.js         라우터, Pages 초기화, 세션관리, 드롭다운
public/js/pages/         각 페이지 JS (my-eval, admin, okr-eval 등)
public/css/style.css     전체 스타일
data/hrmanage.db         SQLite DB (자동 생성)
```

---

## 작업 전 체크리스트

1. 이 파일(CLAUDE.md) 읽기
2. **ClaudeHRM.md 읽기** (DB 스키마, API 목록, 설계 원칙, 개발 이력)
3. 수정할 파일 직접 열어서 현재 상태 확인
4. 작업 완료 후 → CLAUDE.md + ClaudeHRM.md 업데이트

---

## 주요 설계 원칙 (요약)

- **Pages 초기화**: `var Pages = window.Pages || {}` — app.js 최상단, 스크립트 로딩 순서 문제 해결
- **조직도 = 승인 체계**: manager_id 재귀로 N단계 자동 결정
- **평가방식 3차원 매핑**: 조직(org_id) × 기간(eval_period_modes) × 방식(MBO/OKR/KPI)
- **AES-256-CBC 암호화**: 목표명, KPI, 피드백, 의견 전체
- **감사 로그**: 주요 변경 시 자동 기록
- **관리자 dirty 추적**: `_adminDirty`, `markDirty()`, `clearDirty()` — 미저장 경고

→ **상세 내용**: ClaudeHRM.md 참조

---

## 현재 진행 상황

→ ClaudeHRM.md "최근 개발 이력" 참조

---

## 상세 정보 위치 (ClaudeHRM.md)

- DB 스키마 전체 (ERD)
- API 엔드포인트 전체 목록
- 핵심 설계 원칙 상세
- 알려진 버그 및 미완성 항목
- 테스트 계정 정보
- 파일 구조 상세
- 개발 이력 전체
