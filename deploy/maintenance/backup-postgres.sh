#!/usr/bin/env bash
set -euo pipefail

# Back up PostgreSQL to a restic repository outside the VPS. The compressed dump
# exists only in a temporary directory and is removed on every exit path.

: "${ARACHAT_PROJECT_DIR:=/opt/arachat}"
: "${ARACHAT_RESTIC_KEEP_DAILY:=7}"
: "${ARACHAT_RESTIC_KEEP_WEEKLY:=4}"
: "${ARACHAT_RESTIC_KEEP_MONTHLY:=12}"

if [[ -z "${RESTIC_REPOSITORY:-}" || -z "${RESTIC_PASSWORD_FILE:-}" ]]; then
  printf '%s\n' 'RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE must be set in /etc/arachat/maintenance.env' >&2
  exit 2
fi

temporary_dir="$(mktemp -d /var/tmp/arachat-postgres-backup.XXXXXX)"
trap 'rm -rf "$temporary_dir"' EXIT
archive="$temporary_dir/postgres-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

docker compose \
  --project-directory "$ARACHAT_PROJECT_DIR" \
  --env-file "$ARACHAT_PROJECT_DIR/deploy/production.env" \
  -f "$ARACHAT_PROJECT_DIR/deploy/compose.production.yml" \
  exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -c > "$archive"

restic backup --tag arachat-postgres "$archive"
restic forget --prune \
  --tag arachat-postgres \
  --keep-daily "$ARACHAT_RESTIC_KEEP_DAILY" \
  --keep-weekly "$ARACHAT_RESTIC_KEEP_WEEKLY" \
  --keep-monthly "$ARACHAT_RESTIC_KEEP_MONTHLY"
