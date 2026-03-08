#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/zoommate"
UPLOAD_DIR="${APP_ROOT}/uploads"
BACKUP_DIR="/var/backups/zoommate"
LOG_FILE="/var/log/zoommate/backup.log"
ENV_FILE="${APP_ROOT}/.env"

# Cron schedule: 0 2 * * * /opt/zoommate/deploy/backup.sh
if [[ "${1:-}" == "--install-cron" ]]; then
  (crontab -l 2>/dev/null | grep -v "/opt/zoommate/deploy/backup.sh" || true; echo "0 2 * * * /opt/zoommate/deploy/backup.sh") | crontab -
  echo "Installed cron: 0 2 * * * /opt/zoommate/deploy/backup.sh"
  exit 0
fi

mkdir -p "${BACKUP_DIR}" "$(dirname "${LOG_FILE}")"
touch "${LOG_FILE}"
exec >> "${LOG_FILE}" 2>&1

echo "[$(date -Is)] Backup started"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

DATE_STAMP="$(date +%F)"
DB_BACKUP_FILE="${BACKUP_DIR}/db_${DATE_STAMP}.sql"
UPLOADS_BACKUP_FILE="${BACKUP_DIR}/uploads_${DATE_STAMP}.tar.gz"

if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump "${DATABASE_URL}" > "${DB_BACKUP_FILE}"
else
  pg_dump -U "${POSTGRES_USER:-zoommate}" "${POSTGRES_DB:-zoommate}" > "${DB_BACKUP_FILE}"
fi

tar -czf "${UPLOADS_BACKUP_FILE}" -C "${APP_ROOT}" uploads

find "${BACKUP_DIR}" -type f -name "db_*.sql" -mtime +30 -delete
find "${BACKUP_DIR}" -type f -name "uploads_*.tar.gz" -mtime +30 -delete

echo "[$(date -Is)] Backup completed: ${DB_BACKUP_FILE}, ${UPLOADS_BACKUP_FILE}"
