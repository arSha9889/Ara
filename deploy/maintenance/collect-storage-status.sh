#!/usr/bin/env bash
set -euo pipefail

# This script only reads host/Docker state and writes a JSON snapshot for the
# API to display. It deliberately receives no input from the web application.

: "${ARACHAT_STATUS_FILE:=/var/lib/arachat/maintenance/storage-status.json}"
: "${ARACHAT_BACKUP_DIR:=/var/lib/arachat/backups}"
: "${ARACHAT_POSTGRES_VOLUME:=nexus-production_nexus_postgres_data}"
: "${ARACHAT_REDIS_VOLUME:=nexus-production_nexus_redis_data}"
: "${ARACHAT_MARK_CLEANUP:=false}"

bytes_for_path() {
  local path="$1"
  if [[ -e "$path" ]]; then
    du -sb "$path" 2>/dev/null | awk '{print $1}' || printf '0\n'
  else
    printf '0\n'
  fi
}

volume_mountpoint() {
  docker volume inspect "$1" --format '{{ .Mountpoint }}' 2>/dev/null || true
}

docker_root="$(docker info --format '{{ .DockerRootDir }}' 2>/dev/null || true)"
docker_bytes="$(bytes_for_path "$docker_root")"
docker_log_bytes=0
if [[ -n "$docker_root" && -d "$docker_root/containers" ]]; then
  docker_log_bytes="$({
    find "$docker_root/containers" -type f \( -name '*-json.log' -o -path '*/local-logs/*' \) -printf '%s\n' 2>/dev/null || true
  } | awk '{total += $1} END {print total + 0}')"
fi

postgres_bytes="$(bytes_for_path "$(volume_mountpoint "$ARACHAT_POSTGRES_VOLUME")")"
redis_bytes="$(bytes_for_path "$(volume_mountpoint "$ARACHAT_REDIS_VOLUME")")"
backup_bytes="$(bytes_for_path "$ARACHAT_BACKUP_DIR")"

disk_line="$(df -B1 --output=size,used,avail,pcent / | tail -n 1)"
read -r disk_total_bytes disk_used_bytes disk_available_bytes disk_percent_raw <<< "$disk_line"
disk_usage_percent="${disk_percent_raw%%%}"

mkdir -p "$(dirname "$ARACHAT_STATUS_FILE")"
temporary_file="$(mktemp "${ARACHAT_STATUS_FILE}.tmp.XXXXXX")"
trap 'rm -f "$temporary_file"' EXIT

python3 - "$temporary_file" "$ARACHAT_STATUS_FILE" "$ARACHAT_MARK_CLEANUP" <<PY
import json
import sys
from datetime import datetime, timezone

temporary_file, status_file, mark_cleanup = sys.argv[1:]
try:
    with open(status_file, encoding="utf-8") as file:
        previous = json.load(file)
except (OSError, ValueError, TypeError):
    previous = {}

now = datetime.now(timezone.utc).isoformat()
payload = {
    "collected_at": now,
    "last_cleanup_at": now if mark_cleanup == "true" else previous.get("last_cleanup_at"),
    "disk_total_bytes": int("$disk_total_bytes"),
    "disk_used_bytes": int("$disk_used_bytes"),
    "disk_available_bytes": int("$disk_available_bytes"),
    "disk_usage_percent": int("$disk_usage_percent"),
    "docker_bytes": int("$docker_bytes"),
    "docker_log_bytes": int("$docker_log_bytes"),
    "postgres_bytes": int("$postgres_bytes"),
    "redis_bytes": int("$redis_bytes"),
    "local_backup_bytes": int("$backup_bytes"),
}
with open(temporary_file, "w", encoding="utf-8") as file:
    json.dump(payload, file, separators=(",", ":"))
PY

mv "$temporary_file" "$ARACHAT_STATUS_FILE"
