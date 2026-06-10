# 운영 서버 최초 배포 런북 — hrpms.synap.co.kr (NCloud)

> **대상 서버**: hrpms-prod-server (Instance 141198897), Ubuntu 24.04, 2vCPU/8GB, 50GB  
> **목표 도메인**: hrpms.synap.co.kr (DNS A 레코드 이미 등록됨)  
> **예약 공인 IP**: 175.45.192.128 (KR-1, 미할당 → Step 1에서 attach)  
> **인증키**: hrpms-prod-key.pem  
> **⚠️ 이 런북의 모든 명령은 실제 repo 스크립트를 기반으로 생성됨. 임의 추정 없음.**

---

## Phase 0 — NCloud 콘솔 (마스터 수동)

### Step 1 | 공인 IP Attach

1. NCloud 콘솔 → **Server** → hrpms-prod-server 선택
2. **공인 IP 관리** → 175.45.192.128 할당

### Step 2 | ACG 인바운드 규칙 추가

hrpms-prod-server 가 속한 ACG에 아래 3개 규칙 추가:

| 프로토콜 | 포트 | 소스 | 용도 |
|----------|------|------|------|
| TCP | 22 | 마스터 관리 IP/32 | SSH |
| TCP | 80 | 0.0.0.0/0 | HTTP (HTTPS 리다이렉트 + certbot) |
| TCP | 443 | 0.0.0.0/0 | HTTPS |

> 5432(PostgreSQL)는 외부 노출 금지 — 컨테이너 내부 전용.

### Step 3 | DNS 전파 확인

```bash
# 로컬 또는 외부 에서 확인
nslookup hrpms.synap.co.kr
# → 175.45.192.128 이 나와야 함 (TTL에 따라 수분~수십분 소요)
```

---

## Phase 1 — SSH 접속 및 서버 초기화

### Step 4 | SSH 접속

```bash
# NCloud Ubuntu 24.04 기본 SSH 사용자: ubuntu (첫 접속으로 확인)
ssh -i hrpms-prod-key.pem ubuntu@175.45.192.128
```

> 접속 실패 시 `root` 로 재시도:  
> `ssh -i hrpms-prod-key.pem root@175.45.192.128`

### Step 5 | Docker 설치 (미설치 시)

```bash
sudo apt-get update -qq
sudo apt-get install -y docker.io docker-compose-v2 git gettext-base dnsutils
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
# 그룹 적용을 위해 재로그인 후 계속
exit
ssh -i hrpms-prod-key.pem ubuntu@175.45.192.128
docker --version   # Docker version 확인
```

---

## Phase 2 — 코드 배포 및 환경설정

### Step 6 | 코드 클론

```bash
sudo mkdir -p /opt/hrmanage
sudo chown ubuntu:ubuntu /opt/hrmanage
git clone https://github.com/jeremydev99/hrmanage.git /opt/hrmanage
cd /opt/hrmanage
```

### Step 7 | 운영 .env 작성

```bash
cp .env.example .env
nano .env   # 아래 값을 채워 넣기
```

채워야 할 값:

```dotenv
DOMAIN=hrpms.synap.co.kr
CERTBOT_EMAIL=<마스터 이메일>        # Let's Encrypt 만료 알림

POSTGRES_DB=hrmanage
POSTGRES_USER=hrmanage
POSTGRES_PASSWORD=<openssl rand -base64 32 결과>   # 강한 무작위 32+자

TZ=Asia/Seoul
NODE_ENV=production

JWT_SECRET=<openssl rand -base64 32 결과>           # 최소 32자
ENC_SECRET=<openssl rand -hex 16 결과>              # 정확히 32자(hex 16바이트)
# ⚠️ ENC_SECRET 불변 원칙: 설정 후 절대 변경 금지 (변경 시 모든 암호화 필드 복호화 불가)

DB_DRIVER=postgres
DATABASE_URL=postgresql://hrmanage:<위의 POSTGRES_PASSWORD>@postgres:5432/hrmanage
```

시크릿 생성 명령:
```bash
openssl rand -base64 32   # JWT_SECRET / POSTGRES_PASSWORD 용
openssl rand -hex 16      # ENC_SECRET 용 (32 hex chars = 16 bytes)
```

---

## Phase 3 — PostgreSQL 기동 및 스키마 생성

### Step 8 | PostgreSQL 컨테이너 기동

```bash
cd /opt/hrmanage
docker compose --profile postgres up -d postgres
sleep 15
# 연결 확인
docker compose --profile postgres exec postgres \
  psql -U hrmanage -d hrmanage -c "\l"
```

### Step 9 | Prisma 스키마 Push (앱 컨테이너로 실행)

```bash
# 이미지 빌드 (최초 1회)
docker compose build app

# 빈 DB에 스키마 생성
docker compose run --rm app npx prisma db push
# → "Your database is now in sync with your Prisma schema" 확인
```

> **seed-pg.js 실행 금지** — 테스트용 8명/4조직 데이터 투입 금지.

---

## Phase 4 — 설정 3종 Import (테스트 서버 → 운영 서버)

> 테스트 서버에서 `goal_categories` / `grade_policies` + `grade_policy_criteria` / `app_settings` 를 dump해서 운영 서버에 restore합니다.

### Step 10 | 테스트 서버에서 설정 dump

**(테스트 서버 SSH 세션에서 실행)**

```bash
cd /opt/hrmanage   # 테스트 서버 배포 디렉터리

# .env 로드해서 변수 확인 (기본값: POSTGRES_USER=hrmanage, POSTGRES_DB=hrmanage)
set -a; source .env; set +a

docker compose --profile postgres exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-hrmanage}" "${POSTGRES_DB:-hrmanage}" \
  --format=custom --no-owner --no-acl \
  -t goal_categories \
  -t grade_policies \
  -t grade_policy_criteria \
  -t app_settings \
  > /tmp/settings_export.dump

echo "dump 크기: $(wc -c < /tmp/settings_export.dump) bytes"
```

### Step 11 | 운영 서버로 전송

**(로컬 또는 테스트 서버 → 운영 서버)**

```bash
# 로컬 머신에서 테스트 서버 → 로컬 → 운영으로 릴레이하거나,
# 테스트 서버에서 직접 scp (테스트 서버에 prod key가 있어야 함)

# 로컬 머신에서:
scp -i <test-server-key>.pem ubuntu@<테스트서버IP>:/tmp/settings_export.dump .
scp -i hrpms-prod-key.pem settings_export.dump ubuntu@175.45.192.128:/opt/hrmanage/data/postgres-backups/
```

### Step 12 | 운영 서버에서 restore

**(운영 서버 SSH 세션에서 실행)**

```bash
cd /opt/hrmanage

# /opt/hrmanage/data/postgres-backups/ → 컨테이너 내부 /backups/ 로 마운트됨
docker compose --profile postgres exec -T postgres \
  pg_restore -U hrmanage -d hrmanage \
  --no-owner --no-acl \
  /backups/settings_export.dump

echo "설정 import 완료"
# 확인
docker compose --profile postgres exec postgres \
  psql -U hrmanage -d hrmanage \
  -c "SELECT COUNT(*) FROM goal_categories; SELECT COUNT(*) FROM grade_policies; SELECT COUNT(*) FROM app_settings;"
```

---

## Phase 5 — 초기 관리자 계정 부트스트랩

### Step 13 | 관리자 2명 생성

> **계정 정보·비번을 스크립트에 하드코딩 금지.** 아래 환경변수로 주입.
> 생성 순서: 전경헌(CEO, admin, manager=null) → 전용남(master, manager=전경헌)

```bash
cd /opt/hrmanage

ADMIN1_NAME=전경헌 \
ADMIN1_EMAIL=jkh@synap.co.kr \
ADMIN1_PW=<첫번째강한임시비번> \
ADMIN1_ROLE=admin \
ADMIN1_DEPT=경영진 \
ADMIN1_TITLE=대표이사 \
ADMIN2_NAME=전용남 \
ADMIN2_EMAIL=jyn@synap.co.kr \
ADMIN2_PW=<두번째강한임시비번> \
ADMIN2_ROLE=master \
ADMIN2_DEPT=경영지원실 \
ADMIN2_TITLE=이사 \
docker compose run --rm app node scripts/bootstrap-admin.js
```

> **임시 비번 권장**: `openssl rand -base64 16` 으로 생성, 첫 로그인 후 즉시 변경.  
> 비번 변경 경로: 화면 우상단 사용자명 → **비밀번호 변경**

---

## Phase 6 — HTTPS 기동 (인증서 발급)

> `infra-up.sh`가 단계 1~6을 자동 처리합니다. Phase 0~5가 완료된 상태에서 실행.

### Step 14 | infra-up.sh 실행

```bash
cd /opt/hrmanage

# .env가 올바르게 작성됐는지 최종 확인
grep -E "DOMAIN|CERTBOT_EMAIL|POSTGRES_PASSWORD|JWT_SECRET|ENC_SECRET" .env

# 일괄 실행 (Docker 재확인 → PG 기동 → certbot → nginx)
# PG는 이미 기동 중이므로 스크립트 [3/6] PG 단계는 idempotent하게 동작
bash deploy/infra-up.sh
```

스크립트 단계 요약:
1. Docker 설치 확인
2. 배포 디렉터리 준비 (`/opt/hrmanage`)
3. PostgreSQL 기동 (이미 기동 중이면 skip)
4. certbot 설치 → DNS 전파 가드 → **staging dry-run** → **실 인증서 발급**
5. nginx conf 렌더 (`${DOMAIN}` → `hrpms.synap.co.kr`) → nginx 기동
6. 백업 리허설

### Step 15 | 앱 컨테이너 기동 및 nginx proxy 활성화

```bash
cd /opt/hrmanage

# 앱 컨테이너 기동 (nginx depends_on: app)
docker compose up -d app

# 앱 healthy 대기 (최대 2분)
docker compose ps   # app: healthy 확인

# nginx conf에서 proxy_pass 주석 해제 (Phase B 활성화)
# nginx/conf.d/hrpms.conf 는 infra-up.sh가 렌더한 결과물
# 템플릿에 이미 proxy_pass 주석이 있음 → 직접 편집
nano nginx/conf.d/hrpms.conf
# location / { 블록의 proxy_pass 주석(#) 제거 및 저장

# nginx reload
docker compose --profile infra exec nginx nginx -s reload
```

---

## Phase 7 — 검증

### Step 16 | 전체 검증

```bash
# HTTPS 헬스체크
curl -sf https://hrpms.synap.co.kr/healthz && echo "nginx OK"

# 앱 응답
curl -sf https://hrpms.synap.co.kr/api/notice && echo "app OK"

# 컨테이너 상태
docker compose ps
# 기대: app(healthy), postgres(healthy), nginx(healthy)

# 앱 로그 (DB 드라이버·시간대 확인)
docker logs hrmanage_app | grep -E "시간대|PG mode|listening"
```

앱 UI 검증 체크리스트:
- [ ] `https://hrpms.synap.co.kr` 로그인 화면 접근
- [ ] 전용남(jyn@synap.co.kr) 로그인 → 관리자 메뉴 진입
- [ ] 전경헌(jkh@synap.co.kr) 로그인 확인
- [ ] 관리자 → 등급 정책 관리 탭 → 사이냅 표준안 카드 **(활성 기간 바인딩 후 자동펼침)**
- [ ] 관리자 → 감사 로그 → 로그인 기록 시각이 **KST(한국 시간)로 표시**
- [ ] OKR 메뉴: OKR 현황 / 내 OKR 작성 진입 확인

---

## Phase 8 — 백업 정기화

### Step 17 | cron 등록

```bash
# 매일 새벽 3시 자동 백업
(crontab -l 2>/dev/null; echo "0 3 * * * bash /opt/hrmanage/deploy/pg-backup.sh /opt/hrmanage >> /opt/hrmanage/data/postgres-backups/backup.log 2>&1") | crontab -
crontab -l   # 확인
```

수동 백업 실행:
```bash
bash /opt/hrmanage/deploy/pg-backup.sh
# → data/postgres-backups/hrmanage_YYYYMMDD_HHMMSS.dump 생성
# → 14일 초과 dump 자동 삭제
```

---

## Phase 9 — 후속 운영 설정 (배포 직후 필수)

### Step 18 | 첫 평가 기간 생성 + 등급 정책 바인딩

> 설정 import로 `grade_policies`·`app_settings`은 투입됐으나 `eval_periods`(평가 기간)는 **미import**.  
> 평가 기간은 운영 환경 고유 설정이므로 관리자가 직접 생성해야 합니다.

1. 관리자 로그인 → **관리자 설정** → **평가 기간 관리** 탭
2. 신규 평가 기간 생성 (연도·분기·라벨 입력)
3. 생성된 기간에 **등급 정책 바인딩** (사이냅 표준안 선택)
4. 기간 **활성화** → 이후 등급 정책 탭 진입 시 사이냅 표준안 자동 펼침 확인

### Step 19 | 초기 비밀번호 변경

전용남, 전경헌 각각:
1. 로그인 → 화면 우상단 이름 → **비밀번호 변경**
2. 임시 비번 → 개인 강한 비번으로 교체

---

## 참고: 앱 업그레이드 (운영 반영)

```bash
cd /opt/hrmanage
git pull origin main
docker compose build app
docker compose up -d --no-deps app
docker compose ps   # 재기동 확인
```

---

## 참고: 긴급 롤백

```bash
# 이전 git 커밋으로 롤백
cd /opt/hrmanage
git log --oneline -10       # 커밋 목록 확인
git checkout <이전커밋해시>  # 특정 커밋으로 돌아가기
docker compose build app
docker compose up -d --no-deps app
```

---

*런북 생성: 2026-06-10 (INFRA-PROD-1)*  
*기반 스크립트: deploy/infra-up.sh, deploy/pg-backup.sh, scripts/bootstrap-admin.js*
