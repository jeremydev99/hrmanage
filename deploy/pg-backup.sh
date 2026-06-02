#!/usr/bin/env bash
# pg-backup.sh — PostgreSQL 수동 백업
# 사용: bash deploy/pg-backup.sh [backup_dir]
set -euo pipefail
DEPLOY_DIR="${1:-/opt/hrmanage}"
BACKUP_DIR="$DEPLOY_DIR/data/postgres-backups"
mkdir -p "$BACKUP_DIR"
FILENAME="$BACKUP_DIR/hrmanage_$(date +%Y%m%d_%H%M%S).dump"
cd "$DEPLOY_DIR"
docker compose --profile infra exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-hrmanage_user}" \
  --format=custom --no-owner --no-acl "${POSTGRES_DB:-hrmanage}" > "$FILENAME"
echo "Backup: $FILENAME ($(wc -c < "$FILENAME") bytes)"
# 14일 초과 백업 삭제
find "$BACKUP_DIR" -name "*.dump" -mtime +14 -delete
echo "Done."
