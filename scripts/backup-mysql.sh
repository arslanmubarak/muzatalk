#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set."
  exit 1
fi

echo "Backing up MuzTalk MySQL 8 database to ${BACKUP_DIR}/muztalk_${TIMESTAMP}.sql.gz..."
mysqldump --single-transaction --routines --triggers --default-character-set=utf8mb4 \
  -h "${MYSQL_HOST:-127.0.0.1}" -u "${MYSQL_USER:-muztalk_app}" -p"${MYSQL_PASSWORD:-}" \
  "${MYSQL_DATABASE:-muztalk}" | gzip > "${BACKUP_DIR}/muztalk_${TIMESTAMP}.sql.gz"

echo "Backup complete."
