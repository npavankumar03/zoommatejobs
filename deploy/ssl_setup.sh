#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (sudo)." >&2
  exit 1
fi

DOMAIN="${DOMAIN:-jobs.zoommate.in}"
WWW_DOMAIN="${WWW_DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@zoommate.in}"

echo "==> Installing Certbot and Nginx plugin"
apt update -y
apt install -y certbot python3-certbot-nginx

echo "==> Requesting/renewing certificates"
CERTBOT_ARGS=(--nginx -d "${DOMAIN}")
if [[ -n "${WWW_DOMAIN}" && "${WWW_DOMAIN}" != "${DOMAIN}" ]]; then
  CERTBOT_ARGS+=(-d "${WWW_DOMAIN}")
fi

certbot "${CERTBOT_ARGS[@]}" \
  --agree-tos \
  --redirect \
  -m "${LETSENCRYPT_EMAIL}" \
  --non-interactive

echo "==> Configuring auto-renewal cron"
cat > /etc/cron.d/zoommate-certbot <<'CRON'
0 3 * * * root certbot renew --quiet --post-hook "systemctl reload nginx"
CRON
chmod 644 /etc/cron.d/zoommate-certbot

echo "SSL setup complete."
