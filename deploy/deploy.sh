#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/zoommate"
FRONTEND_DIR="${APP_ROOT}/frontend"
BACKEND_DIR="${APP_ROOT}/backend"
SCRAPER_DIR="${APP_ROOT}/scraper"
NODE_VERSION="${NODE_VERSION:-20}"

cd "${APP_ROOT}"

echo "==> Pulling latest code"
git pull origin main

echo "==> Building frontend"
load_node_runtime() {
  local candidates=(
    "${HOME}/.nvm/nvm.sh"
    "/root/.nvm/nvm.sh"
    "/home/zoommate/.nvm/nvm.sh"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -s "${candidate}" ]]; then
      # shellcheck disable=SC1090
      source "${candidate}"
      nvm use "${NODE_VERSION}" >/dev/null 2>&1 || true
      break
    fi
  done
}

load_node_runtime
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found. Install Node.js first (run deploy/setup_server.sh)." >&2
  exit 1
fi

cd "${FRONTEND_DIR}"
npm install
npm run build

echo "==> Installing backend dependencies"
cd "${BACKEND_DIR}"
if [[ ! -d "venv" ]]; then
  python3.11 -m venv venv
fi
venv/bin/pip install --upgrade pip
venv/bin/pip install -r requirements.txt

echo "==> Installing scraper dependencies"
cd "${SCRAPER_DIR}"
if [[ ! -d "venv" ]]; then
  python3.11 -m venv venv
fi
venv/bin/pip install --upgrade pip
if [[ -f "${SCRAPER_DIR}/requirements.txt" ]]; then
  venv/bin/pip install -r "${SCRAPER_DIR}/requirements.txt"
else
  # Reuse backend requirements for scraper runtime when scraper-specific file is absent.
  venv/bin/pip install -r "${BACKEND_DIR}/requirements.txt"
fi

echo "==> Running database migrations"
if [[ -f "${BACKEND_DIR}/alembic.ini" && -x "${BACKEND_DIR}/venv/bin/alembic" ]]; then
  "${BACKEND_DIR}/venv/bin/alembic" upgrade head
else
  echo "Skipping alembic upgrade (alembic.ini or alembic binary not found)."
fi

echo "==> Reloading PM2 apps"
cd "${APP_ROOT}"
# Never touch /opt/zoommate/uploads during deploy.
if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: pm2 not found. Install PM2 first (run deploy/setup_server.sh)." >&2
  exit 1
fi
pm2 reload deploy/pm2.config.js --update-env || pm2 start deploy/pm2.config.js --update-env

echo "Deploy complete"
