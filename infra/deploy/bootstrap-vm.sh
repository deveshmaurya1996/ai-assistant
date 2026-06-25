#!/usr/bin/env bash
set -euo pipefail

# One-time VM bootstrap (build images locally on the VM).
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Create $ENV_FILE before bootstrap (copy from .env.production.example)."
  exit 1
fi

chmod +x "$ROOT_DIR/infra/deploy/deploy.sh"

export GATEWAY_IMAGE="${GATEWAY_IMAGE:-ai-assistant-gateway:latest}"
export AI_RUNTIME_IMAGE="${AI_RUNTIME_IMAGE:-ai-assistant-ai-runtime:latest}"

echo "[bootstrap] building production images..."
docker compose -p ai-assistant --env-file "$ENV_FILE" -f infra/docker/compose.production.yml build

echo "[bootstrap] starting stack..."
SKIP_PULL=true RUN_MIGRATIONS=true "$ROOT_DIR/infra/deploy/deploy.sh"

echo "[bootstrap] complete. Put Caddy/nginx in front of port 10000 for HTTPS."
