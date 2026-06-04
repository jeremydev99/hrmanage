# 사이냅 HR 평가 관리 시스템 — 설치 및 운영 매뉴얼

> **문서 성격**: 고객사 IT/시스템 관리자용 설치·운영 가이드 (러닝 문서)
> **단일 소스**: 본 `.md`를 repo에서 계속 누적. 인프라/배포 PROMPT마다 Claude Code가 해당 섹션 자동 갱신(Auto-Update).
> **최종 산출물**: 마일스톤(Phase B + 앱 착지) 시점에 Word/PDF로 렌더.
> **상태 표기**: ✅ 검증완료 / 🚧 진행중 / ⬜ TODO
> **최초 작성**: 2026-06-02 (INFRA-2D 1·2차 기반)

---

## 0. 문서 개요

본 매뉴얼은 사이냅 HR 평가 관리 시스템을 **고객 자체 인프라**에 설치·운영하기 위한 가이드입니다. 두 가지 배포 환경을 지원합니다.

- **온프레미스**: 고객사 자체 서버(물리/가상)에 설치
- **클라우드 단독 설치**: NCloud 등 IaaS에 고객 전용으로 설치

> 본 시스템은 **벤더 비종속**으로 설계되어, 특정 클라우드 관리형 서비스에 의존하지 않습니다. 동일한 Docker 기반 스택이 온프레미스·클라우드 어디서나 동일하게 동작합니다.

---

## 1. 시스템 아키텍처 ✅

| 구성요소 | 기술 | 비고 |
|---|---|---|
| 애플리케이션 | Node.js 20 + Express | 컨테이너 |
| 데이터베이스 | PostgreSQL 16 | Docker 컨테이너, 내부 네트워크 전용 |
| 리버스 프록시 / TLS | Nginx 1.25 + Let's Encrypt | HTTPS 종단 |
| 컨테이너 런타임 | Docker 28 + Compose v2 | |
| ORM/데이터 접근 | Prisma | DB 비종속 추상화 |

**설계 원칙 (벤더 비종속):**
- 관리형 DB 비의존 → Docker PostgreSQL이 이식 베이스라인
- 시크릿/키 관리 플러그블 (환경변수/파일 → Vault → 클라우드 KMS, 고객보유키 대응) 🚧
- LLM 의존은 설정형/선택형 (망분리 대응, 미설정 시 graceful degrade) 🚧
- 필수 외부 phone-home 없음

> 아키텍처 다이어그램 ⬜ TODO

---

## 2. 사전 요구사항 ✅

### 2.1 서버
- OS: Ubuntu Server 22.04 LTS 이상 (24.04 권장)
- 최소 사양: 2 vCPU / 4GB RAM / 30GB 디스크 (사용자 규모에 따라 조정)
- 루트 또는 sudo 권한

### 2.2 네트워크 / 방화벽
인바운드 허용 포트:

| 포트 | 용도 | 소스 |
|---|---|---|
| 22 | SSH (관리) | 관리자 IP만 (`/32` 제한 권장) |
| 80 | HTTP (HTTPS 리다이렉트 + 인증서 발급) | 전체 |
| 443 | HTTPS | 전체 |

> **5432(PostgreSQL)은 외부에 노출하지 않습니다** — 컨테이너 내부 네트워크 전용.

### 2.3 도메인 / DNS
- 서비스 도메인 1개 (예: `hr.고객사.com`)
- 해당 도메인의 A 레코드 → 서버 공인 IP
- (인증서 자동 발급 시) 도메인 존에 CAA 레코드가 있다면 `letsencrypt.org` 허용 필요. 없으면 무관.
- 폐쇄망(인터넷 차단) 환경은 내부 DNS 사용 → 9장 참조

---

## 3. 설치 ✅ (인터넷 연결 환경)

### 3.1 Docker 설치
```bash
apt update && apt install -y docker.io docker-compose-v2 git
systemctl enable --now docker
```

### 3.2 코드 배포
```bash
git clone -b <배포브랜치> <repo-url> /opt/hrmanage
cd /opt/hrmanage
```
> 코드 전송은 `git clone`을 사용합니다(scp 전체 복사 금지 — 불필요 파일·민감 데이터 유출 방지).

### 3.3 환경설정 (.env)
```bash
cp .env.example .env
```
필수 항목 작성:

| 변수 | 설명 |
|---|---|
| `DOMAIN` | 서비스 도메인 (예: hr.고객사.com) |
| `CERTBOT_EMAIL` | 인증서 만료 알림 이메일 |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | DB 접속 정보 (비밀번호는 강한 무작위값, 예: `openssl rand -hex 24`) |
| `TZ` | 시간대 (Asia/Seoul) |

> 앱 시크릿(`JWT_SECRET`, `ENC_SECRET`) 및 `DATABASE_URL`은 Phase B(앱 착지) 단계에서 설정 🚧

### 3.4 일괄 구성
```bash
bash deploy/infra-up.sh
```
스크립트가 수행하는 작업: Docker 확인 → PostgreSQL 기동 → DNS 전파 검증 → Let's Encrypt 인증서 발급(certbot) → Nginx HTTPS 기동 → 백업 리허설.

> ⚠️ DNS A 레코드 전파가 완료된 후 실행하세요. (스크립트에 DNS 일치 가드 내장 — 불일치 시 중단)

---

## 4. HTTPS / 인증서 ✅

- **자동 발급(인터넷 환경)**: Let's Encrypt, `deploy/infra-up.sh`에 포함. 자동 갱신 타이머(`certbot.timer`) 등록됨.
- **인증서 주입(폐쇄망)**: 고객 사내 CA 발급 인증서 파일 투입 ⬜ TODO (9장)
- Nginx 설정은 `nginx/templates/hrpms.conf.template` → 배포 시 `envsubst '${DOMAIN}'`으로 `nginx/conf.d/hrpms.conf` 자동 렌더 ✅
  - `infra-up.sh` 5단계에서 자동 실행 (`DOMAIN` 변수로 도메인 자동 반영)
  - nginx 변수(`$host`, `$request_uri`, `$scheme` 등)는 allowlist 방식으로 보존
  - 고객사 배포: `DOMAIN=hr.고객사.com ./infra-up.sh` 만으로 인증서 경로·서버명 자동 대응

> **갱신 주의**: 현재 발급 방식(standalone)은 갱신 시 80 포트 일시 해제 필요. 운영 안정화 후 webroot 방식 또는 renew hook 적용 권장 🚧

---

## 5. 운영 ✅

### 5.1 백업
```bash
bash deploy/pg-backup.sh
```
- `data/postgres-backups/`에 `.dump` 생성, 14일 초과분 자동 삭제.
- 정기 백업은 cron 등록 권장 ⬜ TODO
- 오프호스트 백업(별도 저장소) 권장 ⬜ TODO

### 5.2 복구 ⬜ TODO
- `pg_restore` 절차

### 5.3 기동 / 정지 / 재시작
```bash
docker compose --profile postgres --profile infra up -d    # 기동
docker compose ps                                          # 상태 확인
docker compose down                                        # 정지
```

### 5.4 업그레이드 ⬜ TODO
- `git pull` → 재배포 절차, 무중단 고려사항

### 5.5 모니터링 / 로그 ⬜ TODO

---

## 6. 보안 🚧

- TLS 1.2/1.3, HSTS 적용 ✅
- SSH 키 인증 + 관리자 IP 제한 ✅
- DB 외부 미노출 ✅
- 민감 필드 암호화(AES) ✅ / AES-GCM 전환 ⬜ TODO
- 시크릿 관리: 현재 `.env` 파일 → 플러그블 프로바이더(Vault/KMS/BYOK)로 외부화 🚧
- 감사 로그 🚧

---

## 7. 앱 배포 (Phase B) ✅

인프라(PG + nginx HTTPS) 위에 애플리케이션을 착지하는 단계.

### 전제 조건
- `.env` 작성 완료: `JWT_SECRET`, `ENC_SECRET`, `DB_DRIVER=postgres`, `DATABASE_URL=postgresql://...@postgres:5432/...`, `DOMAIN`
- ⚠️ `ENC_SECRET` 불변 원칙: 최초 설정 후 절대 변경 금지 (기존 암호화 데이터 복호화 불가)

### 배포 절차

```bash
# 1. PG 스키마 생성 (최초 1회)
docker compose --profile postgres run --rm app npx prisma db push

# 2. 초기 데이터 시드 (최초 1회)
docker compose --profile postgres run --rm app node scripts/seed-pg.js

# 3. 앱 컨테이너 기동 (DB_DRIVER=postgres, compose.yml에서 자동 적용)
docker compose --profile postgres up -d app

# 4. 앱 healthy 확인 후 nginx 기동 (nginx는 proxy_pass로 app:3000 전달)
docker compose --profile postgres --profile infra up -d nginx
```

### 검증
```bash
# 앱 컨테이너 상태
docker compose ps

# 로그 (PG mode 확인)
docker logs hrmanage_app | grep "시간대\|PG mode"

# HTTPS 엔드포인트
curl -sf https://$DOMAIN/healthz   # nginx healthcheck
curl -sf https://$DOMAIN/api/notice   # 앱 응답 = 착지 성공
```

---

## 8. 트러블슈팅 🚧

| 증상 | 원인 | 조치 |
|---|---|---|
| certbot 발급 실패 | DNS 미전파 / IP 불일치 | A 레코드 전파 확인(`nslookup`) 후 재실행 |
| nginx 기동 실패 | 인증서 경로 불일치 / 발급 전 부팅 | 인증서 발급 후 기동, 도메인 일치 확인 |
| (추가) ⬜ TODO | | |

---

## 9. 폐쇄망(에어갭) 설치 ⬜ TODO

은행·공공기관 등 인터넷 차단(망분리) 환경용. 외부 git·이미지 레지스트리·Let's Encrypt·apt 미러를 사용할 수 없는 환경 대응.
- 오프라인 번들(코드 + Docker 이미지 `docker save/load` + 패키지)로 반입
- 인증서 주입 모드(사내 CA 발급분)
- 내부 미러·내부 DNS·내부 레지스트리 전제

> 상세 ⬜ TODO (폐쇄망 고객 영업 진입 시 작성 — BL-AIRGAP)

---

## 부록 A. 참조 명령 요약 ⬜ TODO
## 부록 B. 기본 사양별 권장 서버 스펙 ⬜ TODO

---

*본 문서는 제품 개발 진행에 따라 계속 갱신됩니다. ✅ 표시 섹션은 실서버(NCloud 테스트, 2026-06-02 INFRA-2D 1·2차)에서 검증된 내용 기반입니다.*
