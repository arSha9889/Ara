#!/usr/bin/env bash
set -euo pipefail

# Fixed host-side invocation of the application's safe retention job. It does
# not expose Docker control to HTTP clients and executes no user-provided input.

: "${ARACHAT_PROJECT_DIR:=/opt/arachat}"

exec docker compose \
  --project-directory "$ARACHAT_PROJECT_DIR" \
  --env-file "$ARACHAT_PROJECT_DIR/deploy/production.env" \
  -f "$ARACHAT_PROJECT_DIR/deploy/compose.production.yml" \
  exec -T api python -m app.maintenance
