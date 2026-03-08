#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/zoommate"
ENV_FILE="${APP_ROOT}/.env"
FRONTEND_ENV_FILE="${APP_ROOT}/frontend/.env"
BACKEND_ENV_FILE="${APP_ROOT}/backend/.env"

mkdir -p "${APP_ROOT}"

prompt_value() {
  local var_name="$1"
  local label="$2"
  local default_value="${3:-}"
  local secret="${4:-false}"
  local value=""

  if [[ "${secret}" == "true" ]]; then
    if [[ -n "${default_value}" ]]; then
      read -r -s -p "${label} [hidden, press Enter for default]: " value
    else
      read -r -s -p "${label} [hidden]: " value
    fi
    echo
  else
    read -r -p "${label}${default_value:+ [${default_value}]}: " value
  fi

  if [[ -z "${value}" ]]; then
    value="${default_value}"
  fi

  printf -v "${var_name}" "%s" "${value}"
}

echo "Setting environment variables for deployment"
echo

DEFAULT_NEXTAUTH_SECRET="$(openssl rand -base64 32 | tr -d '\n')"
DEFAULT_ENCRYPTION_KEY="$(openssl rand -hex 32 | tr -d '\n')"

prompt_value DATABASE_URL "DATABASE_URL" "postgresql://zoommate:change-me@localhost:5432/zoommate"
prompt_value REDIS_URL "REDIS_URL" "redis://localhost:6379/0"
prompt_value GOOGLE_CLIENT_ID "GOOGLE_CLIENT_ID"
prompt_value GOOGLE_CLIENT_SECRET "GOOGLE_CLIENT_SECRET" "" true
prompt_value NEXTAUTH_SECRET "NEXTAUTH_SECRET" "${DEFAULT_NEXTAUTH_SECRET}" true
prompt_value NEXTAUTH_URL "NEXTAUTH_URL" "https://jobs.zoommate.in"
prompt_value NEXT_PUBLIC_API_URL "NEXT_PUBLIC_API_URL" "https://jobs.zoommate.in/api"
prompt_value UPLOAD_DIR "UPLOAD_DIR" "/opt/zoommate/uploads"
prompt_value ENCRYPTION_KEY "ENCRYPTION_KEY" "${DEFAULT_ENCRYPTION_KEY}" true
prompt_value OPENAI_API_KEY "OPENAI_API_KEY" "" true
prompt_value GEMINI_API_KEY "GEMINI_API_KEY" "" true
prompt_value DEFAULT_AI_PROVIDER "DEFAULT_AI_PROVIDER (openai|gemini)" "openai"
prompt_value FRONTEND_URL "FRONTEND_URL" "https://jobs.zoommate.in"

cat > "${ENV_FILE}" <<EOF
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=${NEXTAUTH_URL}
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
UPLOAD_DIR=${UPLOAD_DIR}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}
GEMINI_API_KEY=${GEMINI_API_KEY}
DEFAULT_AI_PROVIDER=${DEFAULT_AI_PROVIDER}
FRONTEND_URL=${FRONTEND_URL}
EOF

cp "${ENV_FILE}" "${FRONTEND_ENV_FILE}"
cp "${ENV_FILE}" "${BACKEND_ENV_FILE}"
chmod 600 "${ENV_FILE}" "${FRONTEND_ENV_FILE}" "${BACKEND_ENV_FILE}"

echo "Environment saved to:"
echo "  ${ENV_FILE}"
echo "  ${FRONTEND_ENV_FILE}"
echo "  ${BACKEND_ENV_FILE}"

if command -v pm2 >/dev/null 2>&1; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  pm2 reload /opt/zoommate/deploy/pm2.config.js --update-env || pm2 start /opt/zoommate/deploy/pm2.config.js --update-env || true
  echo "PM2 reload attempted."
else
  echo "PM2 not found in PATH. Reload manually after sourcing NVM."
fi
