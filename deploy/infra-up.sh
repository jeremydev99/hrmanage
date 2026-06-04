#!/usr/bin/env bash
# ============================================================
# infra-up.sh — NCloud 인프라 최초 구성 스크립트 (INFRA-2D-1-FIX3)
# 실행: bash deploy/infra-up.sh
#
# 전제:
#   - Ubuntu 22.04+, sudo 권한
#   - Phase 0 완료 (DNS A 레코드 전파, ACG 80/443/22 허용)
#   - 배포: git clone (scp 아님 — PII·.env 유출 방지)
#     git clone -b feat/infra-ncloud <repo-url> /opt/hrmanage
#   - .env 파일을 /opt/hrmanage/.env 에 직접 작성 (git clone 이후)
#     (실 시크릿, .gitignore 보호됨)
# ============================================================
set -euo pipefail

DOMAIN="${DOMAIN:-hrpms.synap.co.kr}"
DEPLOY_DIR="/opt/hrmanage"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"   # .env에서 로드하거나 직접 지정

# .env 로드 (POSTGRES_PASSWORD, CERTBOT_EMAIL 등)
if [ -f "$DEPLOY_DIR/.env" ]; then
  set -a; source "$DEPLOY_DIR/.env"; set +a
fi

if [ -z "$CERTBOT_EMAIL" ]; then
  echo "[오류] CERTBOT_EMAIL이 설정되어 있지 않습니다. .env에 추가하세요."
  exit 1
fi

echo "=== [1/6] Docker 설치 및 기동 ==="
if ! command -v docker &>/dev/null; then
  sudo apt-get update -qq
  # NCloud Ubuntu 저장소 기준: docker-compose-v2 (plugin 패키지명 없음)
  sudo apt-get install -y docker.io docker-compose-v2
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
  echo "Docker 설치 완료 — 재로그인 필요 (docker 그룹 적용)"
else
  echo "Docker 이미 설치됨: $(docker --version)"
fi

echo ""
echo "=== [2/6] 배포 디렉터리 준비 ==="
sudo mkdir -p "$DEPLOY_DIR"
sudo chown "$USER":"$USER" "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/data/postgres-backups" "$DEPLOY_DIR/nginx/conf.d"

echo ""
echo "=== [3/6] PostgreSQL 컨테이너 기동 (내부 네트워크만) ==="
cd "$DEPLOY_DIR"
# postgres 서비스는 postgres 프로필 소속
docker compose --profile postgres up -d postgres
echo "PG 기동 대기 (15s)..."
sleep 15
docker compose --profile postgres exec postgres \
  psql -U "${POSTGRES_USER:-hrmanage}" -d "${POSTGRES_DB:-hrmanage}" -c "\l"
echo "PG 스모크 테스트..."
docker compose --profile postgres exec postgres \
  psql -U "${POSTGRES_USER:-hrmanage}" -d "${POSTGRES_DB:-hrmanage}" -c \
  "CREATE TABLE _smoke(id int); INSERT INTO _smoke VALUES(1); SELECT * FROM _smoke; DROP TABLE _smoke;"
echo "PG OK"

echo ""
echo "=== [4/6] certbot 설치 + TLS 인증서 발급 (--standalone) ==="
# 주의: certbot --standalone은 80 포트를 직접 점유하므로
#       nginx 컨테이너를 올리기 전(=지금)에 실행. nginx는 step 5에서 기동.

# dig 설치 확인 (DNS 검증에 사용)
command -v dig &>/dev/null || sudo apt-get install -y dnsutils

if ! command -v certbot &>/dev/null; then
  sudo apt-get install -y certbot
fi

# ── DNS 전파 가드 (레이트리밋 방지) ──────────────────────────
THIS_IP="$(curl -sf https://ifconfig.me || hostname -I | awk '{print $1}')"
RESOLVED="$(dig +short "$DOMAIN" | tail -1)"

echo "서버 IP: $THIS_IP"
echo "DNS 조회: $DOMAIN → $RESOLVED"

if [ -z "$RESOLVED" ] || [ "$RESOLVED" != "$THIS_IP" ]; then
  echo "[중단] DNS 미전파/불일치: $DOMAIN → '$RESOLVED' (서버 IP '$THIS_IP')"
  echo "       A 레코드 전파(최대 48h) 후 재실행하세요."
  exit 1
fi
echo "DNS 일치 확인 OK"

# ── staging --dry-run 리허설 (레이트리밋 안전) ────────────────
echo "certbot staging 리허설 (--standalone, nginx 미기동 상태)..."
sudo certbot certonly \
  --standalone \
  -d "$DOMAIN" \
  --staging --dry-run \
  --non-interactive --agree-tos \
  -m "$CERTBOT_EMAIL" \
  || { echo "[중단] certbot staging 실패 — DNS 확인 후 재실행"; exit 1; }
echo "certbot staging OK"

# ── 실 발급 ─────────────────────────────────────────────────
echo "certbot 실 인증서 발급..."
sudo certbot certonly \
  --standalone \
  -d "$DOMAIN" \
  --non-interactive --agree-tos \
  -m "$CERTBOT_EMAIL"

echo "자동 갱신 타이머 확인..."
sudo systemctl status certbot.timer --no-pager || \
  (sudo systemctl enable --now certbot.timer && echo "certbot.timer 활성화 완료")

echo ""
echo "=== [5/6] Nginx HTTPS 기동 (인증서 발급 후) ==="
# 템플릿 → 실제 conf 렌더 (${DOMAIN}만 치환, nginx $host/$scheme 등 보존)
command -v envsubst &>/dev/null || sudo apt-get install -y gettext-base
mkdir -p "$DEPLOY_DIR/nginx/conf.d"
DOMAIN="$DOMAIN" envsubst '${DOMAIN}' \
  < "$DEPLOY_DIR/nginx/templates/hrpms.conf.template" \
  > "$DEPLOY_DIR/nginx/conf.d/hrpms.conf"
echo "nginx conf 렌더 완료: $DEPLOY_DIR/nginx/conf.d/hrpms.conf (DOMAIN=$DOMAIN)"
# 이 시점에 /etc/letsencrypt/live/$DOMAIN/fullchain.pem 존재 → nginx 정상 기동
docker compose --profile infra up -d nginx
sleep 3
curl -sf "https://$DOMAIN/healthz" && echo "HTTPS /healthz OK" \
  || echo "HTTPS 검증 실패 — 로그: docker compose --profile infra logs nginx"
curl -s -o /dev/null -w "HTTP→HTTPS redirect: %{http_code}\n" "http://$DOMAIN/"

echo ""
echo "=== [6/6] 백업 리허설 ==="
BACKUP_FILE="$DEPLOY_DIR/data/postgres-backups/smoke_$(date +%Y%m%d_%H%M%S).sql"
# postgres 서비스는 postgres 프로필 소속
docker compose --profile postgres exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-hrmanage}" "${POSTGRES_DB:-hrmanage}" > "$BACKUP_FILE"
echo "백업 생성: $BACKUP_FILE ($(wc -c < "$BACKUP_FILE") bytes)"

echo ""
echo "==============================="
echo "INFRA-2D-1 구성 완료"
echo "  HTTPS: https://$DOMAIN/healthz"
echo "  PG: docker compose --profile postgres exec postgres psql -U hrmanage"
echo "  백업: $BACKUP_FILE"
echo ""
echo "Phase B 착지 시 할 일:"
echo "  1. nginx/conf.d/hrpms.conf의 proxy_pass 주석 해제"
echo "  2. .env의 DATABASE_URL을 postgresql://... 으로 변경"
echo "  3. app 서비스 docker compose up -d"
echo ""
echo "certbot 갱신 안내:"
echo "  갱신 시 nginx가 80 포트 점유 중 → standalone 갱신은 nginx 일시 중지 필요"
echo "  (webroot 방식 전환: certbot renew --cert-name $DOMAIN --webroot -w /var/www/certbot)"
echo "==============================="
