#!/bin/sh
set -eu

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r/\\r/g; s/\t/\\t/g'
}

cat > /usr/share/nginx/html/env.js <<EOF
window.__NEXUS_RUNTIME_CONFIG__ = {
  VITE_API_BASE_URL: "$(json_escape "${VITE_API_BASE_URL:-}")",
  VITE_WS_BASE_URL: "$(json_escape "${VITE_WS_BASE_URL:-}")",
  VITE_TELEGRAM_BOT_NAME: "$(json_escape "${VITE_TELEGRAM_BOT_NAME:-}")"
};
EOF
