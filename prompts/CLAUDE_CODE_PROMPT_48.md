# CLAUDE_CODE_PROMPT_48 — Prisma DATABASE_URL 절대경로 수정

## 작업 개요

Docker 환경에서 Prisma가 DB 파일을 못 여는 버그(`Error code 14: Unable to open the database file`) 해결.

원인: `docker-compose.yml`의 `DATABASE_URL=file:./data/hrmanage.db`가 상대경로. Prisma는 상대경로 기준을 `schema.prisma` 파일 위치(`/app/prisma/`)로 잡으므로, 실제로 `/app/prisma/data/hrmanage.db`를 열려고 시도하여 실패. 실제 DB는 `/app/data/hrmanage.db`에 있음.

이건 INFRA-1 시점부터 있던 **잠복 버그**. Prisma 기반 라우터(`/api/auth/me`, `/api/categories`)가 검증되지 않아서 표면화 안 됐었음.

## 작업 위험도: 하 (docker-compose.yml 1줄 수정)

## 작업 절차

### 1. docker-compose.yml 수정

현재:
```yaml
- DATABASE_URL=file:./data/hrmanage.db
```

다음으로 변경:
```yaml
- DATABASE_URL=file:/app/data/hrmanage.db
```

상대경로 `./data/` → 절대경로 `/app/data/`. 단 한 글자 차이.

### 2. .env 파일도 확인

`.env`에 `DATABASE_URL`이 있다고 했음. 그 경로도 함께 점검:

```powershell
type .env | findstr DATABASE_URL
```

만약 `.env`의 `DATABASE_URL`이 `file:../data/hrmanage.db` 형태라면, 이건 **로컬 직접 실행(node server/index.js)** 시 사용되는 경로다. 이건 그대로 유지. 이유:
- 로컬 직접 실행 시 `prisma/` 폴더 기준으로 `../data/hrmanage.db` = `프로젝트루트/data/hrmanage.db` 정상 경로
- 로컬에서는 잘 동작 중

즉, **.env 수정 안 함. docker-compose.yml만 수정.**

### 3. Docker 재시작 검증

```powershell
# 컨테이너 종료
docker-compose down

# 재기동
docker-compose up
```

기동 후 다음 확인:
- 콘솔에 `PrismaClientInitializationError` 또는 `Error code 14` 메시지 **없음**
- 브라우저 http://localhost:3000 접속 → 로그인(ceo@synapsoft.com / admin1234) → 정상 로그인 성공
- 로그인 후 메인 화면 진입 시 카테고리 데이터 정상 로드 (관리자 페이지 등)

### 4. 문서 업데이트

`ClaudeHRM.md`의 "환경변수 (.env)" 표에서 `DATABASE_URL` 행 옆에 주석 보완:

기존:
```
| DATABASE_URL | DB 연결 문자열 (Prisma) | file:../data/hrmanage.db |
```

다음으로 변경:
```
| DATABASE_URL | DB 연결 문자열 (Prisma) | 로컬: file:../data/hrmanage.db / Docker: file:/app/data/hrmanage.db |
```

"최근 개발 이력" 섹션 맨 위에 1줄 추가:
```
| 2026-05-20 | Docker 환경 Prisma DATABASE_URL 절대경로 수정 (잠복 버그 — INFRA-1 시점부터 존재, Prisma 라우터 미검증으로 미발견) (PROMPT 48) | Claude Code |
```

### 5. Git 커밋

```bash
git add docker-compose.yml ClaudeHRM.md
git commit -m "fix: Docker Prisma DATABASE_URL 절대경로 수정 (잠복 버그) (PROMPT 48)"
```

**push는 사용자 수동.**

## 작업 완료 체크리스트

- [ ] docker-compose.yml의 DATABASE_URL이 `file:/app/data/hrmanage.db`로 변경됨
- [ ] .env 파일은 수정하지 않음 (로컬용 경로 유지)
- [ ] `docker-compose down` 후 `docker-compose up`으로 재기동
- [ ] PrismaClientInitializationError 메시지 사라짐
- [ ] 로그인 정상, 로그인 후 카테고리 로드 정상
- [ ] ClaudeHRM.md 업데이트 (환경변수 표 + 개발 이력)
- [ ] git commit 완료

## 추가 참고 (조사 결과)

이 버그가 INFRA-1 직후 검증 시점부터 잠재했었던 이유:
- INFRA-1 검증 시 `/api/notice`(better-sqlite3), `/api/auth/login`(better-sqlite3) 등 better-sqlite3 기반 라우터만 거쳤을 가능성
- Prisma 기반 라우터는 PROMPT 36-4 이후 점진 도입(User, GoalCategory, ...): `/api/auth/me`, `/api/categories`, etc.
- 로그인 직후 클라이언트가 `/api/auth/me` 호출하면서 Prisma가 처음 실제 동작 → 그제서야 표면화

INFRA-2A-4 (실제 PostgreSQL 마이그레이션) 시점에는 이런 잠복 버그가 더 많이 노출될 수 있으므로 검증 시나리오에 Prisma 기반 라우터를 명시 포함할 것.
