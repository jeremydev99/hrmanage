# CLAUDE_CODE_PROMPT_49 — Docker env_file 추가 (LLM 환경변수 주입)

## 작업 개요

AI 성과 요약 기능에서 LLM 호출 403 Forbidden 발생. 원인은 `LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL` 환경변수가 컨테이너에 주입되지 않아 인증 헤더 없이 호출되기 때문.

`.env`는 `.dockerignore`로 빌드 컨텍스트에서 제외돼 컨테이너 내부에 파일 존재하지 않음. docker-compose.yml의 `environment:` 섹션에도 LLM_* 환경변수가 없음. 해결: docker-compose.yml에 `env_file: .env` 지시어 추가.

`env_file`은 docker-compose가 런타임에 호스트의 `.env`를 읽어 환경변수로 주입하는 메커니즘. `.dockerignore` 빌드 제외와 무관하게 동작. 보안상 `.env`는 여전히 Git/이미지에 노출되지 않음.

## 작업 위험도: 하 (docker-compose.yml 2줄 추가)

## 작업 절차

### 1. docker-compose.yml 수정

`services.app` 아래 `container_name` 다음에 `env_file` 지시어 추가:

```yaml
services:
  app:
    build: .
    container_name: hrmanage_app
    env_file:
      - .env
    ports:
      - "3000:3000"
    volumes:
      # ... 기존 그대로 ...
    environment:
      # ... 기존 그대로 ...
```

**주의**: `env_file`은 `environment`보다 먼저 적용되고, 같은 키가 양쪽에 있으면 `environment` 값이 우선. 따라서 docker-compose.yml의 `environment:` 섹션은 그대로 둬도 무관. 특히 `DATABASE_URL`은 컨테이너용 절대경로(/app/data/...)가 environment에 명시돼 있으므로 .env의 로컬용 상대경로가 override 못함. 안전.

### 2. 검증

```powershell
# 재기동
docker-compose down
docker-compose up
```

기동 후 환경변수 주입 확인:
```powershell
docker exec hrmanage_app sh -c "echo LLM_API_BASE=$LLM_API_BASE"
docker exec hrmanage_app sh -c "echo LLM_MODEL=$LLM_MODEL"
docker exec hrmanage_app sh -c 'test -n "$LLM_API_KEY" && echo "LLM_API_KEY: SET" || echo "LLM_API_KEY: EMPTY"'
```

기대 출력:
```
LLM_API_BASE=https://chat.synap.co.kr/api/chat/completions
LLM_MODEL=SynapAssistant-MoE-30B
LLM_API_KEY: SET
```

### 3. 기능 검증

브라우저에서:
1. http://localhost:3000 로그인 (ceo@synapsoft.com / admin1234)
2. 성과관리 페이지 진입
3. "🤖 AI 성과 요약" → "요약 생성" 버튼 클릭
4. 정상 응답 확인 (403 에러 없음, AI 요약 텍스트 출력)

만약 여전히 403이 나면:
- `.env`의 `LLM_API_KEY` 값 자체가 무효한지 확인 (별도 진단)
- 사내 LLM 서버 자체 상태 확인 (별도 진단)

### 4. 문서 업데이트

`ClaudeHRM.md`의 "환경변수 (.env)" 섹션에 다음 메모 추가 (표 아래):

```
**Docker 환경 주의**: docker-compose가 호스트의 `.env`를 `env_file` 지시어로 컨테이너에 주입.
`.env` 파일이 호스트의 docker-compose.yml과 같은 디렉토리에 있어야 함. `.dockerignore`로
빌드 제외돼도 `env_file`은 별도 메커니즘이라 문제없음.
```

"최근 개발 이력" 섹션 맨 위에 1줄 추가:
```
| 2026-05-20 | Docker env_file 추가 (LLM_* 환경변수 컨테이너 주입, AI 요약 403 해결) (PROMPT 49) | Claude Code |
```

### 5. Git 커밋

```bash
git add docker-compose.yml ClaudeHRM.md
git commit -m "fix: Docker env_file 추가 (LLM 환경변수 주입, AI 요약 403 해결) (PROMPT 49)"
```

**push는 사용자 수동.**

## 작업 완료 체크리스트

- [ ] docker-compose.yml에 `env_file: - .env` 지시어 추가
- [ ] `docker-compose down && docker-compose up` 재기동
- [ ] `docker exec`로 LLM_API_BASE, LLM_MODEL, LLM_API_KEY 정상 주입 확인
- [ ] AI 성과 요약 기능 정상 동작 (403 에러 없음)
- [ ] ClaudeHRM.md 업데이트 (환경변수 섹션 메모 + 개발 이력)
- [ ] git commit 완료

## 추가 참고

이 잠복 버그도 INFRA-1(Docker 도입) 시점부터 존재. AI 요약 기능을 Docker 환경에서 실제 테스트하지 않아 미발견.

향후 검증 시나리오에 AI 요약 기능도 포함 권장.

JWT_SECRET, ENC_SECRET이 docker-compose.yml에 평문 하드코딩된 보안 이슈는 INFRA-3 범위. 이번 작업에서는 LLM 키 주입 문제만 해결.
