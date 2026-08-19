#!/usr/bin/env bash
set -euo pipefail

# Fixed host-side invocation. It does not accept HTTP parameters or expose
# Docker control to the application.

: "${ARACHAT_PROJECT_DIR:=/opt/arachat}"

exec docker compose \
  --project-directory "$ARACHAT_PROJECT_DIR" \
  --env-file "$ARACHAT_PROJECT_DIR/deploy/production.env" \
  -f "$ARACHAT_PROJECT_DIR/deploy/compose.production.yml" \
  exec -T api python -m app.maintenance scheduled
