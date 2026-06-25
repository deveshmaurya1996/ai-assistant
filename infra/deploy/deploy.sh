#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ai-assistant}"
COMPOSE_FILE="infra/docker/compose.production.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
SKIP_PULL="${SKIP_PULL:-false}"
DEPLOY_HEALTH_URL="${DEPLOY_HEALTH_URL:-}"

compose() {
  docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

if [[ -z "${GATEWAY_IMAGE:-}" || -z "${AI_RUNTIME_IMAGE:-}" ]]; then
  echo "GATEWAY_IMAGE and AI_RUNTIME_IMAGE must be set (OCIR tags or local tags)."
  exit 1
fi

if [[ -n "${OCI_REGISTRY:-}" && -n "${OCI_USERNAME:-}" && -n "${OCI_AUTH_TOKEN:-}" ]]; then
  echo "[deploy] logging in to OCIR ($OCI_REGISTRY)..."
  echo "$OCI_AUTH_TOKEN" | docker login "$OCI_REGISTRY" --username "$OCI_USERNAME" --password-stdin
fi

if [[ "$SKIP_PULL" != "true" ]]; then
  echo "[deploy] pulling gateway and ai-runtime images..."
  compose pull gateway ai-runtime
fi

echo "[deploy] ensuring infra is up..."
compose up -d postgres redis qdrant

echo "[deploy] starting app containers..."
compose up -d --force-recreate --no-deps gateway ai-runtime

echo "[deploy] waiting for gateway health..."
ready=false
for _ in $(seq 1 36); do
  if compose exec -T gateway \
    node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||10000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 5
done

if [[ "$ready" != "true" ]]; then
  echo "[deploy] gateway health check timed out"
  compose ps
  compose logs --tail=80 gateway ai-runtime
  exit 1
fi

if [[ "$RUN_MIGRATIONS" == "true" ]]; then
  echo "[deploy] running database migrations..."
  compose run --rm --no-deps gateway \
    sh -c 'cd /app/packages/database && node ../../node_modules/prisma/build/index.js migrate deploy'
fi

docker image prune -f >/dev/null 2>&1 || true

if [[ -n "$DEPLOY_HEALTH_URL" ]]; then
  echo "[deploy] checking public health: $DEPLOY_HEALTH_URL/health"
  curl -fsS "$DEPLOY_HEALTH_URL/health" >/dev/null
fi

echo "[deploy] done"
