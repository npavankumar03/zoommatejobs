#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (sudo)." >&2
  exit 1
fi

APP_USER="root"
APP_GROUP="root"
APP_ROOT="/opt/zoommate"
UPLOAD_DIR="${APP_ROOT}/uploads"
LOG_DIR="/var/log/zoommate"
BACKUP_DIR="/var/backups/zoommate"

DB_NAME="${DB_NAME:-zoommate}"
DB_USER="${DB_USER:-zoommate}"
DB_PASSWORD="${DB_PASSWORD:-}"

NODE_VERSION="20"
NVM_VERSION="v0.39.7"
export DEBIAN_FRONTEND="noninteractive"

echo "==> Updating system packages"
apt update -y
apt upgrade -y

echo "==> Installing base system packages"
apt install -y \
  ca-certificates \
  curl \
  git \
  gnupg \
  lsb-release \
  software-properties-common \
  build-essential \
  ufw \
  nginx \
  redis-server \
  certbot \
  python3-certbot-nginx \
  python3.11 \
  python3.11-venv \
  python3-pip \
  python3-dev \
  libpq-dev

echo "==> Installing PostgreSQL 15"
install -d /usr/share/postgresql-common/pgdg
if [[ ! -f /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg ]]; then
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
fi

echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list

apt update -y
apt install -y postgresql-15 postgresql-client-15

echo "==> Enabling core services"
systemctl enable --now postgresql
systemctl enable --now redis-server
systemctl enable --now nginx

echo "==> Creating app directories"
mkdir -p "${APP_ROOT}" "${UPLOAD_DIR}" "${LOG_DIR}" "${BACKUP_DIR}"
chown -R "${APP_USER}:${APP_GROUP}" "${APP_ROOT}" "${LOG_DIR}" "${BACKUP_DIR}"
chmod 750 "${APP_ROOT}" "${UPLOAD_DIR}" "${LOG_DIR}" "${BACKUP_DIR}"

echo "==> Installing NVM + Node.js ${NODE_VERSION} for root"
export HOME="/root"
export NVM_DIR="${HOME}/.nvm"
if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
fi
# shellcheck disable=SC1090
source "${NVM_DIR}/nvm.sh"
nvm install "${NODE_VERSION}"
nvm alias default "${NODE_VERSION}"
npm install -g pm2 playwright
playwright install chromium

echo "==> Configuring PostgreSQL database and user"
# Run postgres commands from a world-readable directory.
cd /tmp

ROLE_EXISTS="$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" || true)"
if [[ "${ROLE_EXISTS}" == "1" ]]; then
  if [[ -n "${DB_PASSWORD}" ]]; then
    DB_PASSWORD_ESCAPED="$(printf "%s" "${DB_PASSWORD}" | sed "s/'/''/g")"
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE "${DB_USER}" WITH LOGIN PASSWORD '${DB_PASSWORD_ESCAPED}';
SQL
  else
    echo "PostgreSQL role '${DB_USER}' already exists and DB_PASSWORD not provided; keeping existing password."
  fi
else
  if [[ -z "${DB_PASSWORD}" ]]; then
    DB_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
  fi
  DB_PASSWORD_ESCAPED="$(printf "%s" "${DB_PASSWORD}" | sed "s/'/''/g")"
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE "${DB_USER}" LOGIN PASSWORD '${DB_PASSWORD_ESCAPED}';
SQL
fi

if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  runuser -u postgres -- createdb -O "${DB_USER}" "${DB_NAME}"
fi

echo "==> Configuring UFW firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "Server setup complete."
echo "Next steps:"
echo "1) Clone your repo into ${APP_ROOT} as root."
echo "2) Run deploy/env_setup.sh to create ${APP_ROOT}/.env."
echo "3) Copy deploy/nginx.conf to /etc/nginx/sites-available/zoommate and enable it."
echo "4) Run deploy/ssl_setup.sh after DNS points to this server."
echo "5) Start app with PM2: cd ${APP_ROOT} && pm2 start deploy/pm2.config.js"
echo "6) Save PM2 process list: pm2 save && pm2 startup systemd -u root --hp /root"
echo
echo "PostgreSQL credentials:"
echo "  DB_NAME=${DB_NAME}"
echo "  DB_USER=${DB_USER}"
if [[ -n "${DB_PASSWORD}" ]]; then
  echo "  DB_PASSWORD=${DB_PASSWORD}"
else
  echo "  DB_PASSWORD=(unchanged existing password)"
fi
