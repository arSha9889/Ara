#!/usr/bin/env bash
set -euo pipefail

# Keep only Docker data that is not used by any container and has been unused
# for at least 14 days. Never prune volumes, networks, or running/stopped
# containers: application data is stored in named volumes.

: "${ARACHAT_DOCKER_RETENTION_HOURS:=336}"

docker image prune --all --force --filter "until=${ARACHAT_DOCKER_RETENTION_HOURS}h"
docker builder prune --all --force --filter "until=${ARACHAT_DOCKER_RETENTION_HOURS}h"
ARACHAT_MARK_CLEANUP=true /usr/local/lib/arachat/collect-storage-status.sh
