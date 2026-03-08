#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/zoommate"
FRONTEND_DIR="${APP_ROOT}/frontend"
BACKEND_DIR="${APP_ROOT}/backend"

cd "${APP_ROOT}"

echo "==> Pulling latest code"
git pull origin main

echo "==> Building frontend"
export NVM_DIR="${HOME}/.nvm"
if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "${NVM_DIR}/nvm.sh"
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

echo "==> Running database migrations"
if [[ -f "${BACKEND_DIR}/alembic.ini" && -x "${BACKEND_DIR}/venv/bin/alembic" ]]; then
  "${BACKEND_DIR}/venv/bin/alembic" upgrade head
else
  echo "Skipping alembic upgrade (alembic.ini or alembic binary not found)."
fi

echo "==> Reloading PM2 apps"
cd "${APP_ROOT}"
# Never touch /opt/zoommate/uploads during deploy.
pm2 reload deploy/pm2.config.js --update-env || pm2 start deploy/pm2.config.js --update-env

echo "Deploy complete"
