# PROMPT 42: 피드백 작성 화면의 중간 보고 전체 표시 (UI 버그 수정)

> 작성일: 2026-05-19
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 41 완료 (897983f push)
> 위험도: 낮음 (클라이언트 단일 파일 작은 수정)
> 예상 소요: 15~20분
> 저장 위치: prompts/CLAUDE_CODE_PROMPT_42.md

---

## 배경

PROMPT 41 검증 도중 발견된 UI 이슈.

**증상**: 피드백 작성 화면에서 부하직원의 중간 보고가 **80자에서 잘려서 1줄로만 표시**됨. 부하직원이 작성한 목표별 진행 내용(테스트 111, 222, 333)을 평가자가 전체 못 봄.

**원인 위치**: `public/js/pages/feedback.js` 의 `renderGiveFeedback()` 함수 내부, 약 90~100줄.

**핵심 코드**:
```javascript
${reports.slice(0,2).map(r => `
  <div ...>
    <span ...>${(r.created_at||'').slice(0,10)}</span>
    ${r.content ? r.content.slice(0,80) + (r.content.length > 80 ? '...' : '') : ''}
  </div>`).join('')}
${reports.length > 2 ? `<div ...>외 ${reports.length-2}건</div>` : ''}
```

문제점:
- `slice(0, 80)` 으로 **80자만 표시**
- 줄바꿈(`\n`)이 보존 안 됨
- `slice(0, 2)` 로 **최근 2건만 표시**, 나머지는 "외 N건"으로 숨김

---

## 수정 방향

### 결정된 방식 — 전체 펼쳐서 표시

- 80자 제한 제거 → **전체 내용 표시**
- 줄바꿈 보존 → **`\n` → `<br>`** 변환
- 보고서 전체 표시 → **최근 2건 제한 해제**
- 가독성 위해 보고서별 구분선 유지

### 사용자 입장에서의 효과

평가자(예: dev3의 상사 dev1)가 피드백 화면을 펼쳤을 때:
- dev3가 작성한 모든 중간 보고가 전체 내용으로 보임
- `[테스트 111] ... [테스트 222] ... [테스트 333] ...` 형식의 보고도 줄바꿈 그대로 보임
- 평가자가 부하직원의 노력을 정확히 평가 가능

---

## 작업 범위

### 수정 파일 1개
- `public/js/pages/feedback.js`

### 수정 영역 1곳
- `renderGiveFeedback()` 함수 내부의 "중간 보고 표시" 블록

서버 코드, API, 다른 파일 변경 없음.

---

## 작업 지시

### 수정 대상 코드 위치

`public/js/pages/feedback.js` 의 `renderGiveFeedback()` 함수 내부.

찾는 방법: `📋 중간 보고` 텍스트 또는 `/reports/` API 호출 부분 검색.

### 기존 코드 (변경 전)

```javascript
    // 중간 보고 표시
    try {
      const reports = await API.get('/reports/' + ev.id).catch(() => []);
      if (reports && reports.length) {
        const rptDiv = document.createElement('div');
        rptDiv.style.cssText = 'background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:10px;margin-bottom:12px';
        rptDiv.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--o700);margin-bottom:6px">📋 중간 보고 (${reports.length}건)</div>
          ${reports.slice(0,2).map(r => `
            <div style="font-size:12px;color:var(--o800);padding:4px 0;border-bottom:1px solid var(--o100)">
              <span style="color:var(--muted);margin-right:6px">${(r.created_at||'').slice(0,10)}</span>
              ${r.content ? r.content.slice(0,80) + (r.content.length > 80 ? '...' : '') : ''}
            </div>`).join('')}
          ${reports.length > 2 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">외 ${reports.length-2}건</div>` : ''}`;
        body.appendChild(rptDiv);
      }
    } catch(e) {}
```

### 변경 후 코드

```javascript
    // 중간 보고 표시 (PROMPT 42: 80자 제한 제거, 줄바꿈 보존, 전체 펼쳐서 표시)
    try {
      const reports = await API.get('/reports/' + ev.id).catch(() => []);
      if (reports && reports.length) {
        const rptDiv = document.createElement('div');
        rptDiv.style.cssText = 'background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:10px;margin-bottom:12px';
        // HTML escape 헬퍼 (XSS 방지)
        const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        rptDiv.innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--o700);margin-bottom:8px">📋 중간 보고 (${reports.length}건)</div>
          ${reports.map((r, idx) => `
            <div style="font-size:13px;color:var(--o800);padding:8px 0;${idx < reports.length-1 ? 'border-bottom:1px solid var(--o100);margin-bottom:4px' : ''}">
              <div style="color:var(--muted);font-size:11px;margin-bottom:4px">보고 #${idx+1} · ${(r.created_at||'').slice(0,10)}</div>
              <div style="white-space:pre-wrap;line-height:1.6">${esc(r.content || '')}</div>
            </div>`).join('')}`;
        body.appendChild(rptDiv);
      }
    } catch(e) {}
```

### 주요 변경 사항

| 항목 | 변경 전 | 변경 후 |
|------|--------|--------|
| 표시 보고서 수 | `slice(0,2)` (최근 2건) | **전체** |
| 내용 길이 제한 | `slice(0,80)` (80자) | **제한 없음 (전체)** |
| 줄바꿈 처리 | 없음 | **`white-space: pre-wrap` (보존)** |
| 보고서별 헤더 | 날짜만 | **"보고 #N · 날짜"** |
| HTML 안전성 | XSS 노출 가능 | **`esc()` 헬퍼로 escape** |
| 폰트 크기 | 12px | 13px (가독성) |
| 구분선 위치 | 모든 항목 | 마지막 항목 제외 |
| "외 N건" 표시 | 있음 | 제거 (전체 표시되므로 불필요) |

---

## XSS 방지 — 중요 보안 처리

기존 코드는 `r.content`를 **그대로 innerHTML에 삽입**합니다. 사용자가 보고 내용에 `<script>` 같은 HTML 태그를 입력하면 그대로 실행됩니다 (Cross-Site Scripting 취약점).

이번 수정에서 `esc()` 헬퍼로 escape 처리하여:
- `<` → `&lt;`
- `>` → `&gt;`
- `&` → `&amp;`
- `"` → `&quot;`
- `'` → `&#39;`

이는 **추가 보안 강화**이지만 기존 동작과 호환됩니다 (일반 텍스트 입력은 그대로 표시).

`white-space: pre-wrap` CSS와 함께 사용하여:
- 줄바꿈은 `<br>` 변환 없이도 CSS로 보존
- HTML 인젝션은 차단

---

## 검증 절차

### 1. 서버 실행
```powershell
node server\index.js
```

또는 Docker 사용 시:
```powershell
docker-compose up
```

### 2. 브라우저 검증

`dev1@synapsoft.com / user1234` 로그인 (dev3의 상사).

| 단계 | 동작 | 기대 결과 |
|------|------|----------|
| 2-1 | 피드백 메뉴 진입 | 피드백 작성 탭 표시 |
| 2-2 | dev3 (한개발) 카드 클릭하여 "펼치기" | 본문 영역 열림 |
| 2-3 | **"📋 중간 보고 (N건)" 영역 확인** | **전체 내용 보임, 줄바꿈 보존** |
| 2-4 | dev3가 작성한 "[테스트 111]", "[테스트 222]" 등 | 한 줄에 잘리지 않고 전체 표시 |
| 2-5 | 보고서가 여러 건이면 모두 보임 | "외 N건" 메시지 없음 |

### 3. F12 Console 에러 확인

`renderGiveFeedback` 관련 에러 없는지.

### 4. XSS 검증 (선택)

dev3로 로그인하여 중간 보고에 다음 입력 후 저장:
```
<script>alert('xss')</script>테스트
```

다시 dev1로 로그인하여 피드백 화면에서:
- **alert가 뜨면 안 됨** (escape 정상 작동)
- 텍스트로 `<script>alert('xss')</script>테스트` 보여야 함 (안전하게 표시)

---

## 완료 후 처리

### 1. ClaudeHRM.md 갱신

"최근 개발 이력" 표 상단:
```
| 2026-05-19 | PROMPT 42: 피드백 화면 중간 보고 전체 표시 UI 버그 수정 (80자 제한 해제, 줄바꿈 보존, XSS 방지) | Claude Code |
```

### 2. 커밋 + 푸시

```powershell
git add public/js/pages/feedback.js
git add ClaudeHRM.md
git add prompts/CLAUDE_CODE_PROMPT_42.md
git commit -m "fix(feedback): 피드백 화면 중간 보고 전체 표시 (PROMPT 42)"
git push
```

---

## 작업 시 주의사항

- **`renderGiveFeedback()` 함수만 수정** — `renderReceivedFeedback()` 등 다른 함수 건드리지 말 것
- **서버 API 변경 없음** — `/api/reports/:evalId` 라우터는 그대로
- **다른 파일 변경 없음** — `public/js/pages/feedback.js` 한 파일만
- **들여쓰기 일관성** — 기존 코드의 2-space 들여쓰기 유지
- **XSS escape 헬퍼 함수 위치** — `try` 블록 내부에 정의 (다른 곳에 영향 없음)

---

## 다음 작업 예고

### PROMPT 43 — Feedback Repository (제안)
- 본격 도메인 작업
- /api/feedback/* 라우터들
- 암호화 필드 2개 (overall_note, feedback_items.note)
- 1.5시간 예상

### PROMPT 40-B — EvalCycle 나머지
- /api/evals/my-history
- /api/evals/my-mgr-pending
- 1시간 예상

### INFRA-2 — PostgreSQL 도입
- 운영 준비
- 1.5시간 예상
