# PROMPT INFRA-1: Docker 환경 전환

> 작성일: 2026-05-18
> 브랜치: feat/prisma-orm (또는 별도 브랜치 권장: feat/docker)
> 선행 작업: PROMPT 40-A 완료 (8bffbe4 push 완료)
> 시리즈: INFRA (인프라 신규 시리즈)
> 위험도: 낮음 (기존 코드 거의 변경 없음, 신규 파일 위주)
> 예상 소요: 1.5~2시간
> 환경 전제: Docker Desktop 29.4.3 + Compose 설치 완료 (확인됨)

---

## 배경

현재 hrmanage는 Windows PowerShell + Node.js 직접 실행 방식입니다. 다음 문제들이 반복 발생했습니다:

- 한글 인코딩 깨짐 (`.gitignore` BOM 사고)
- 포트 충돌 (EADDRINUSE)
- 임시 파일 잔여 (`_search.js` 등)
- 한글 폴더명 SSH 오류 (`\300\374\277\353\263\262`)
- LF/CRLF 줄바꿈 경고

이번 작업으로 **Docker 컨테이너 기반 개발 환경**으로 전환합니다.

---

## 작업의 의미

### 즉시 효과
- 환경 일관성: Linux 컨테이너 안에서 통일된 UTF-8, LF
- 격리: 호스트 OS와 분리된 깔끔한 실행 환경
- 신규 PC 셋업: `docker-compose up` 한 줄

### 장기 효과
- **클라우드 배포 직결**: 같은 이미지를 그대로 배포
- **PostgreSQL 통합 준비**: docker-compose.yml에 DB 컨테이너 추가만 하면 됨
- **CI/CD 도입 기반**: GitHub Actions로 자동 빌드/배포 가능

---

## 안전성

### 데이터 보존
- 기존 `data/hrmanage.db` 파일은 **volume mount**로 컨테이너와 호스트가 공유
- 컨테이너 재시작/삭제해도 DB 데이터 손실 없음
- 기존 평가 데이터 100% 그대로 사용

### 코드 보존
- 기존 server/, public/, prisma/ 폴더 그대로
- volume mount로 호스트의 코드 변경이 즉시 컨테이너에 반영
- VS Code에서 편집 → 컨테이너에서 자동 인식

### 롤백 가능성
- 만약 Docker 환경에서 문제 발생 시 → `node server\index.js` 로 즉시 복귀 가능
- Dockerfile, docker-compose.yml은 신규 파일이라 삭제만 하면 됨
- 기존 워크플로우는 그대로 작동

---

## 작업 범위

### 신규 파일 3개
1. `Dockerfile` — 컨테이너 이미지 정의
2. `docker-compose.yml` — 컨테이너 오케스트레이션
3. `.dockerignore` — 컨테이너에 복사하지 않을 파일 목록

### 수정 파일 2개
1. `server/index.js` — DB_PATH를 환경변수 기반으로 (이미 일부 적용됨)
2. `.gitignore` — Docker 관련 파일 무시 규칙 추가

### 신규 명령어
- 기존: `node server\index.js`
- 신규: `docker-compose up`

---

## 작업 지시

### 1단계 — .dockerignore 생성

`/.dockerignore` 파일을 새로 만들고 다음 내용 작성:

```
# 컨테이너 빌드 시 복사하지 않을 파일
node_modules
npm-debug.log
.env
.env.local
.env.*.local
.git
.gitignore
.dockerignore
Dockerfile
docker-compose.yml
README.md
*.md
.vscode
.idea
data/*.db-journal
data/*.db-wal
data/*.db-shm
prompts/
.claude/
```

**목적**:
- node_modules은 컨테이너 안에서 새로 설치하므로 호스트에서 복사 안 함
- .env는 컨테이너에 직접 노출하지 않음 (docker-compose.yml의 environment로 주입)
- prompts/는 개발 문서이므로 컨테이너에 불필요
- .git, .vscode 등 메타 파일도 컨테이너 불필요

---

### 2단계 — Dockerfile 생성

프로젝트 루트(`C:\claudeprojects\hrmanage\`)에 `Dockerfile` (확장자 없음) 파일을 만들고 다음 내용 작성:

```dockerfile
# ============================================================
# hrmanage — Node.js + SQLite 컨테이너
# ============================================================

# Alpine Linux 기반 Node.js 20 (가볍고 빠름)
FROM node:20-alpine

# 작업 디렉토리
WORKDIR /app

# 시스템 의존성 (better-sqlite3 빌드용)
RUN apk add --no-cache python3 make g++ gcc

# package.json + package-lock.json 먼저 복사 (Docker 캐시 최적화)
COPY package*.json ./

# 의존성 설치
RUN npm install

# Prisma schema 복사 (generate에 필요)
COPY prisma ./prisma

# Prisma Client 생성
RUN npx prisma generate

# 나머지 소스 코드 복사
COPY server ./server
COPY public ./public
COPY *.bat ./

# data 디렉토리 생성 (volume mount 포인트)
RUN mkdir -p /app/data

# 시간대 설정 (한국 시간)
ENV TZ=Asia/Seoul

# 포트 노출
EXPOSE 3000

# 실행 명령
CMD ["node", "server/index.js"]
```

**주요 결정 사항**:
- **node:20-alpine** 사용 — 200MB 이하의 가벼운 이미지
- **빌드 도구 설치**(python3, make, gcc) — better-sqlite3가 네이티브 모듈이라 필요
- **레이어 캐싱 최적화** — package.json 먼저 복사하여 의존성 변경 없을 때 빠른 재빌드
- **Prisma generate** 빌드 시점에 실행
- **TZ=Asia/Seoul** 시간대 명시

---

### 3단계 — docker-compose.yml 생성

프로젝트 루트에 `docker-compose.yml` 파일을 만들고 다음 내용 작성:

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: hrmanage_app
    ports:
      - "3000:3000"
    volumes:
      # DB 영속화 (호스트와 공유)
      - ./data:/app/data
      # 코드 hot-reload (호스트 변경 시 컨테이너 즉시 반영)
      - ./server:/app/server
      - ./public:/app/public
      - ./prisma:/app/prisma
    environment:
      - PORT=3000
      - DATABASE_URL=file:./data/hrmanage.db
      - JWT_SECRET=synap-hr-local-dev-secret-2025
      - ENC_SECRET=synap-local-enc-secret-32bytes!!
      - TZ=Asia/Seoul
      - NODE_ENV=development
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/notice"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

**주요 결정 사항**:
- **volumes 3가지**:
  - `./data:/app/data` — DB 파일 영속화 (재시작해도 데이터 유지)
  - `./server`, `./public`, `./prisma` — 코드 hot-reload (VS Code 편집이 컨테이너에 즉시 반영)
- **environment** 4개 — server/index.js의 process.env 값 주입
- **restart: unless-stopped** — 컨테이너 비정상 종료 시 자동 재시작
- **healthcheck** — 컨테이너 정상 작동 모니터링 (선택적)

---

### 4단계 — server/index.js의 DB_PATH 환경변수 대응

현재 코드:
```javascript
const DB_PATH = path.join(__dirname, '..', 'data', 'hrmanage.db');
```

변경 후:
```javascript
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hrmanage.db');
```

**의미**:
- 환경변수 `DB_PATH`가 있으면 우선 사용
- 없으면 기존 경로 사용 (기존 워크플로우 호환)

**주의**: docker-compose.yml의 environment에는 `DATABASE_URL`만 있지만, server/index.js의 SQLite 직접 접속용으로 `DB_PATH`도 필요합니다. docker-compose.yml의 environment에 다음 추가:

```yaml
- DB_PATH=/app/data/hrmanage.db
```

---

### 5단계 — .gitignore 갱신

`.gitignore` 파일 끝에 다음 줄 추가:

```
# Docker
.docker/
*.log

# 컨테이너 빌드 캐시
.docker-cache/
```

이미 `node_modules`, `data/`, `*.db`, `.env`는 무시 중이므로 추가할 필요 없음.

---

### 6단계 — 실행 검증

#### 6-1. 이미지 빌드

```powershell
cd C:\claudeprojects\hrmanage
docker-compose build
```

**예상 출력**:
```
[+] Building 45.3s (15/15) FINISHED
 => [internal] load .dockerignore
 => [internal] load Dockerfile
 => [build] FROM docker.io/library/node:20-alpine
 => [build] RUN apk add ...
 => [build] COPY package*.json ./
 => [build] RUN npm install
 ...
 => exporting to image
 => => writing image sha256:abc123...
 => => naming to docker.io/library/hrmanage_app
```

**오류 시 대응**:
- `Cannot find package` — 의존성 문제, package.json 확인
- `better-sqlite3 build failed` — Alpine 빌드 도구 누락, Dockerfile의 apk add 확인
- `permission denied` — Docker Desktop 권한 문제, 재시작

#### 6-2. 컨테이너 실행

```powershell
docker-compose up
```

**예상 출력**:
```
[+] Running 1/1
 ✔ Container hrmanage_app  Created
Attaching to hrmanage_app
hrmanage_app  | ✅ 시간대 설정: Asia/Seoul
hrmanage_app  | ╔════════════════════════════════════════════╗
hrmanage_app  | ║  ㈜사이냅소프트 인사평가 시스템               ║
hrmanage_app  | ║  로컬 테스트 서버 가동 완료                   ║
hrmanage_app  | ║  브라우저 접속: http://localhost:3000        ║
hrmanage_app  | ...
```

기존 PowerShell 출력과 동일한 환영 메시지가 보여야 정상.

#### 6-3. 브라우저 접속

`http://localhost:3000` 접속.

기존과 100% 동일하게 작동해야 함:
- 로그인 화면 표시
- `ceo@synapsoft.com` / `admin1234` 로그인 정상
- 모든 메뉴 동작
- 기존 평가 데이터 그대로 보임

#### 6-4. 컨테이너 종료

```powershell
docker-compose down
```

또는 실행 중인 터미널에서 `Ctrl + C`.

---

## 작업 흐름 변경 안내

### 기존 vs 신규

| 작업 | 기존 (PowerShell) | 신규 (Docker) |
|------|-------------------|---------------|
| 서버 실행 | `node server\index.js` | `docker-compose up` |
| 서버 중지 | `Ctrl + C` | `Ctrl + C` 또는 `docker-compose down` |
| 백그라운드 실행 | 별도 창 | `docker-compose up -d` |
| 로그 보기 | 터미널 화면 | `docker-compose logs -f` |
| 코드 수정 반영 | 서버 재시작 | 자동 (volume mount) 또는 `docker-compose restart` |
| Prisma Studio | `npx prisma studio` | `npx prisma studio` (호스트에서 실행) |
| 컨테이너 안 들어가기 | 불필요 | `docker exec -it hrmanage_app sh` |

### 자주 쓸 명령어

```powershell
# 빌드 + 실행 (처음 또는 Dockerfile 변경 후)
docker-compose up --build

# 일반 실행
docker-compose up

# 백그라운드 실행
docker-compose up -d

# 중지
docker-compose down

# 로그 보기 (백그라운드 실행 중일 때)
docker-compose logs -f

# 컨테이너 안 접속 (디버깅용)
docker exec -it hrmanage_app sh

# 이미지 빌드만
docker-compose build

# 컨테이너 + 이미지 + volume 모두 삭제 (초기화)
docker-compose down -v --rmi all
```

---

## 검증 절차

### 검증 시나리오 1 — 빌드 + 실행

| 단계 | 명령 | 기대 결과 |
|------|------|----------|
| 1-1 | `docker-compose build` | 오류 없이 빌드 완료 |
| 1-2 | `docker-compose up` | 환영 메시지 박스 출력 |
| 1-3 | 브라우저 `http://localhost:3000` | 로그인 화면 정상 |
| 1-4 | `ceo@synapsoft.com / admin1234` 로그인 | 정상 |

### 검증 시나리오 2 — 데이터 보존

| 단계 | 동작 | 기대 결과 |
|------|------|----------|
| 2-1 | 기존 평가 데이터 조회 | 기존 데이터 그대로 보임 |
| 2-2 | 새 평가 생성 후 제출 | 정상 |
| 2-3 | `docker-compose down` 으로 종료 | 정상 종료 |
| 2-4 | `docker-compose up` 으로 재실행 | 재시작 후 2-2의 평가 데이터 그대로 보임 |

### 검증 시나리오 3 — 코드 hot-reload

| 단계 | 동작 | 기대 결과 |
|------|------|----------|
| 3-1 | VS Code에서 server/index.js 편집 | 예: console.log 추가 |
| 3-2 | 파일 저장 | 컨테이너가 변경 감지 (volume mount) |
| 3-3 | `docker-compose restart app` | 서버 재시작, 변경사항 반영 |

(완전 자동 hot-reload는 nodemon 같은 도구 필요. 일단은 수동 restart)

### 검증 시나리오 4 — ngrok 연동 (기존 외부 공유 유지)

| 단계 | 동작 | 기대 결과 |
|------|------|----------|
| 4-1 | 호스트에서 ngrok 별도 실행 (`ngrok http 3000`) | 외부 URL 발급 |
| 4-2 | 외부 URL로 접속 | 정상 (Docker 컨테이너가 호스트의 3000번 포트로 노출되어 있음) |

---

## 잠재 이슈와 대응

### 이슈 1 — better-sqlite3 빌드 실패

**원인**: Alpine Linux에서 네이티브 모듈 컴파일 도구 누락  
**대응**: Dockerfile의 `RUN apk add --no-cache python3 make g++ gcc` 줄 확인

### 이슈 2 — DB 파일 권한 문제

**원인**: Docker 컨테이너의 사용자 권한과 호스트 파일 권한 불일치  
**증상**: "SQLITE_READONLY" 또는 "permission denied"  
**대응**: docker-compose.yml에 다음 추가:
```yaml
user: "${UID:-1000}:${GID:-1000}"
```

### 이슈 3 — Windows 경로 문제

**원인**: Windows 경로 구분자(`\`)와 Linux 경로(`/`) 차이  
**증상**: 빌드 시 경로 오류  
**대응**: docker-compose.yml의 volumes는 `./data` 형식으로 (이미 적용)

### 이슈 4 — 첫 빌드 시간이 오래 걸림

**원인**: Node 이미지 다운로드 + 의존성 설치  
**예상 시간**: 5~10분 (첫 빌드만, 이후 캐시 활용)  
**대응**: 인내. 두 번째 빌드부터는 30초 이내.

### 이슈 5 — Docker Desktop이 안 실행됨

**원인**: WSL 2 미설치, Hyper-V 비활성화 등  
**대응**: Docker Desktop 설정 확인, Windows 기능에서 WSL 2 활성화

---

## 완료 후 처리

### 1. ClaudeHRM.md 갱신

"최근 개발 이력" 표 상단에 한 줄 추가:
```
| 2026-05-18 | PROMPT INFRA-1: Docker 환경 전환 (Dockerfile, docker-compose.yml 도입, 코드 hot-reload 지원) | Claude Code |
```

"파일 구조"에 신규 파일 추가:
```
Dockerfile               ← 컨테이너 이미지 정의
docker-compose.yml       ← 오케스트레이션
.dockerignore            ← 빌드 제외 파일
```

"실행" 항목 갱신:
```
| 실행 | docker-compose up → http://localhost:3000 (또는 기존 node server/index.js 도 가능) |
```

### 2. 커밋 + 푸시

```powershell
git add Dockerfile
git add docker-compose.yml
git add .dockerignore
git add .gitignore
git add server/index.js
git add ClaudeHRM.md
git add prompts/CLAUDE_CODE_PROMPT_INFRA-1.md
git commit -m "feat(infra): Docker 환경 도입 (Dockerfile + docker-compose.yml)"
git push
```

---

## 작업 시 주의사항

- **Docker Desktop 실행 확인 필수**: 작업 시작 전 작업표시줄에서 Docker 아이콘이 살아있는지 확인
- **기존 워크플로우 보존**: `node server\index.js` 도 여전히 작동해야 함. 강제 전환 아님
- **DB 데이터 백업 권장**: 작업 전 `data/hrmanage.db` 파일을 별도 폴더에 복사해두기 (만약을 대비)
- **첫 빌드 인내**: 5~10분 걸릴 수 있음. 중도 취소 금지
- **volume mount 경로**: docker-compose.yml의 `./data` 등은 docker-compose.yml 파일이 있는 위치 기준이므로 반드시 프로젝트 루트에서 실행
- **포트 충돌 확인**: 기존 node 프로세스가 3000번을 잡고 있으면 충돌. `taskkill /IM node.exe /F` 로 먼저 종료
- **ngrok은 호스트에서**: ngrok은 컨테이너 안이 아닌 Windows에서 실행. 기존 방식 그대로

---

## 다음 작업 예고

### INFRA-2 — PostgreSQL 도입
- docker-compose.yml에 postgres 서비스 추가
- Prisma datasource를 sqlite → postgresql 변경
- 데이터 마이그레이션 스크립트

### INFRA-3 — HTTPS + 보안 시크릿 .env 분리
- ENC_SECRET, JWT_SECRET을 .env 파일로 분리
- AES-256-CBC → AES-256-GCM 업그레이드

### INFRA-4 — 클라우드 배포 준비
- GitHub Actions로 자동 빌드
- AWS/Vercel/Railway 중 선택
