# 작업 35: CLAUDE.md Git 규칙 추가 + AI 요약 UI 줄바꿈 + 디버깅 로그 정리

> 작성일: 2026-05-13
> 선행 작업: PROMPT_34 (사내 LLM 연동) 완료, 동작 확인 완료
> 목적: 협업 규칙 자동화 + UI 표시 버그 수정

---

## 작업 전 확인사항

1. CLAUDE.md, ClaudeHRM.md 먼저 읽기
2. 이전 작업(34번)으로 사내 LLM 연동이 정상 동작 중임을 확인

---

## 작업 1: CLAUDE.md에 Git 자동 커밋 규칙 추가

### 위치
CLAUDE.md 최상단의 "매 세션 시작 시 반드시" 블록 바로 아래.

### 추가할 내용
기존 인용 블록 아래에 다음 3줄을 추가:

```markdown
> **코드 변경 작업 완료 후 반드시**: `git add . && git commit` 자동 실행 (push는 사용자가 수동)
> **커밋 메시지 규칙**: 한 줄, "작업 내용 (PROMPT_번호)" 형식. 작업번호가 없으면 작업 내용만 한 줄로
> **커밋 메시지 예시**: "사내 LLM 연동 + .env 분리 (PROMPT_34)", "시간대 Asia/Seoul로 변경"
```

### 결과 형태 (참고)
```markdown
# CLAUDE.md — Claude Code 세션 가이드

> **매 세션 시작 시 반드시**: 이 파일 읽기 → ClaudeHRM.md 읽기 → 수정할 파일 직접 확인
> **작업 완료 후 반드시**: CLAUDE.md + ClaudeHRM.md 둘 다 업데이트
> **코드 변경 작업 완료 후 반드시**: `git add . && git commit` 자동 실행 (push는 사용자가 수동)
> **커밋 메시지 규칙**: 한 줄, "작업 내용 (PROMPT_번호)" 형식
> **커밋 메시지 예시**: "사내 LLM 연동 + .env 분리 (PROMPT_34)"

---
```

---

## 작업 2: AI 요약 UI 줄바꿈 깨짐 수정

### 현상
서버에서 받은 응답에는 줄바꿈(`\n`)이 있는데, UI 화면에는 한 줄로 표시됨.

서버 응답 예:
```
📊 성과 요약:  
2025년 1분기에는...
지속된 상태입니다.  

💡 개선 제안:  
지속적인 성과 평가...
```

UI 표시 결과 (잘못된 상태):
```
2025년 1분기에는...지속된 상태입니다.    💡 개선 제안:   지속적인 성과 평가...
```

### 원인 추정
public/js/app.js의 `loadAISummary()` 함수에서 응답을 `innerHTML`로 삽입하는데,
HTML은 기본적으로 `\n` 문자를 공백으로 처리함. `white-space:pre-wrap` 스타일이 있어도
`innerHTML` 삽입 시점에 이미 줄바꿈이 손실되는 경우가 있음.

### 수정 방법

public/js/app.js의 `loadAISummary` 함수에서 다음 부분을 수정:

**Before**:
```javascript
content.innerHTML = `
  <div style="white-space:pre-wrap;line-height:1.8;color:var(--o800)">${r.summary}</div>
  <div style="font-size:11px;color:var(--muted);margin-top:8px">AI 분석 결과는 참고용입니다. 실제 평가와 다를 수 있습니다.</div>`;
```

**After** (textContent 활용으로 줄바꿈 보존):
```javascript
const summaryEl = document.createElement('div');
summaryEl.style.cssText = 'white-space:pre-wrap;line-height:1.8;color:var(--o800)';
summaryEl.textContent = r.summary;

const noticeEl = document.createElement('div');
noticeEl.style.cssText = 'font-size:11px;color:var(--muted);margin-top:8px';
noticeEl.textContent = 'AI 분석 결과는 참고용입니다. 실제 평가와 다를 수 있습니다.';

content.innerHTML = '';
content.appendChild(summaryEl);
content.appendChild(noticeEl);
```

**왜 이렇게 바꾸나**:
- `textContent`는 `\n`을 그대로 텍스트로 보존 (`innerHTML`은 일부 환경에서 정규화)
- `white-space:pre-wrap`이 텍스트 노드에서 정상 작동
- 보안 측면에서도 `textContent`가 XSS에 안전 (LLM이 HTML 태그를 응답에 포함시켜도 그대로 텍스트로 표시)

---

## 작업 3: 디버깅 로그 제거

### 위치
server/index.js의 `/api/perf/ai-summary` 라우터 안.

### 제거할 코드
PROMPT_34에서 임시로 추가한 응답 구조 확인용 로그:

```javascript
console.log('[ai-summary] LLM 응답 구조:', JSON.stringify(data).substring(0, 500));
```

이 줄을 **삭제**.

### 유지할 코드
다음 에러 로그는 그대로 유지 (운영에서도 필요):
```javascript
console.error('[ai-summary] LLM 응답 오류:', response.status, errText);
```

---

## 작업 4: 문서 업데이트

### 4-1) ClaudeHRM.md "최근 개발 이력" 표 최상단에 추가
```
| 2026-05-13 | CLAUDE.md Git 자동 커밋 규칙 추가, AI 요약 UI 줄바꿈 수정, 디버깅 로그 제거 (PROMPT_35) | Claude Code |
```

### 4-2) 같은 날짜에 이미 여러 항목이 있으면 정리
- 사내 LLM 연동 (PROMPT_34) 완료 항목과 함께 자연스럽게 배치
- 시간대 Asia/Seoul 변경 항목도 함께 정리

---

## 작업 5: 자동 Git 커밋 (이번 작업부터 적용)

위 모든 작업 완료 후, **이번 작업부터 새 규칙 적용**:

```bash
cd C:\claudeprojects\hrmanage
git add .
git commit -m "CLAUDE.md Git 자동 커밋 규칙 + AI 요약 UI 줄바꿈 수정 (PROMPT_35)"
```

**주의**: `git push`는 사용자가 직접 실행할 예정이므로 Claude Code는 commit까지만 진행.

---

## 작업 완료 후 사용자에게 안내할 내용

1. **변경된 파일 목록**
2. **CLAUDE.md에 추가된 규칙 내용 확인 요청**
3. **자동 커밋 완료 메시지**: 커밋 해시와 메시지 보여주기
4. **사용자가 직접 할 일**:
   - `git push` 한 줄 실행
   - 브라우저에서 AI 요약 다시 호출해서 줄바꿈 정상 표시 확인

---

## 검증 방법

작업 완료 후 사용자 검증 흐름:

1. **자동 커밋 확인**: `git log --oneline -3` 으로 새 커밋 보임
2. **push 실행**: `git push`
3. **AI 요약 줄바꿈 확인**:
   - 서버 재시작 불필요 (서버 코드 변경은 console.log 제거뿐, 이 한 줄은 nodemon이 자동 재시작 처리)
   - 브라우저 새로고침 (Ctrl+Shift+R) 후 dev3로 로그인
   - 성과관리 홈 → "요약 생성" 클릭
   - 응답이 여러 줄로 잘 표시되면 OK

---

## 예상 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| 자동 커밋 시 "nothing to commit" | 변경 파일 없음 | 작업이 실제로 반영되었는지 재확인 |
| push 시 인증 요구 | SSH 키 만료 또는 첫 push | GitHub 인증 안내 |
| 줄바꿈이 여전히 안 보임 | 브라우저 캐시 | Ctrl+Shift+R로 강제 새로고침 |
| LLM 응답에 줄바꿈이 원래부터 없음 | LLM이 한 줄로 응답 | 프롬프트에 "줄바꿈 포함하여 출력" 명시 (선택사항) |
