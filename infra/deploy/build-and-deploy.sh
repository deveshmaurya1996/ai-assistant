#!/usr/bin/env bash
set -euo pipefail

# Build gateway and ai-runtime images on the VM, then start the production stack.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

export GATEWAY_IMAGE="${GATEWAY_IMAGE:-ai-assistant-gateway:latest}"
export AI_RUNTIME_IMAGE="${AI_RUNTIME_IMAGE:-ai-assistant-ai-runtime:latest}"

echo "[build] building production images..."
docker compose -p ai-assistant --env-file "$ENV_FILE" -f infra/docker/compose.production.yml build

echo "[deploy] starting stack..."
SKIP_PULL=true RUN_MIGRATIONS=true "$ROOT_DIR/infra/deploy/deploy.sh"

echo "[build] complete"
