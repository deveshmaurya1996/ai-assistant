#!/usr/bin/env bash
set -euo pipefail

# CI entry point after the repo is synced on the VM. Serializes deploys and dispatches strategy.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DEPLOY_STRATEGY="${DEPLOY_STRATEGY:?DEPLOY_STRATEGY is required (build or pull)}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/ai-assistant-deploy.lock}"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deploy is already running on this host."
  exit 1
fi

case "$DEPLOY_STRATEGY" in
  build)
    exec "$ROOT_DIR/infra/deploy/build-and-deploy.sh"
    ;;
  pull)
    export RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
    exec "$ROOT_DIR/infra/deploy/deploy.sh"
    ;;
  *)
    echo "Invalid DEPLOY_STRATEGY: $DEPLOY_STRATEGY (expected build or pull)"
    exit 1
    ;;
esac
