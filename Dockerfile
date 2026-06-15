
FROM node:22-bookworm AS pruner
WORKDIR /app
RUN corepack enable
COPY . .
COPY .docker.npmrc ./.npmrc
RUN pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm catalog:generate && pnpm catalog:validate \
 && pnpm exec turbo prune @ai-assistant/gateway --docker

FROM node:22-bookworm AS node_build
WORKDIR /app
RUN corepack enable
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY .docker.npmrc ./.npmrc
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
RUN pnpm exec turbo run build --filter=@ai-assistant/gateway...

FROM python:3.12-slim-bookworm AS python_deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY services/ai-runtime/requirements.txt ./services/ai-runtime/requirements.txt
RUN pip install --no-cache-dir -r services/ai-runtime/requirements.txt

FROM python:3.12-slim-bookworm AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor ffmpeg curl ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

COPY --from=python_deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=python_deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=node_build /app/node_modules ./node_modules
COPY --from=node_build /app/packages ./packages
COPY --from=node_build /app/services/gateway ./services/gateway
COPY --from=node_build /app/services/tool-runtime ./services/tool-runtime
COPY --from=node_build /app/services/capability-runtime ./services/capability-runtime
COPY connectors ./connectors
COPY catalog ./catalog
COPY services/ai-runtime ./services/ai-runtime
COPY --from=pruner /app/services/ai-runtime/capability_manifest.json ./services/ai-runtime/capability_manifest.json
COPY planner-config ./planner-config
COPY infra/supervisor/supervisord.conf ./infra/supervisor/supervisord.conf

RUN BETTER_AUTH_SECRET=docker-build-smoke-test-only-not-used-at-runtime-00 \
 && test -f /app/services/ai-runtime/capability_manifest.json \
 && test -f /app/services/ai-runtime/orchestration/agent_pipeline.py \
 && uvicorn --version \
 && cd /app/services/ai-runtime \
 && PYTHONPATH=/app/services/ai-runtime python -c "from main import app; assert '/health' in app.openapi().get('paths', {})" \
 && cd /app/services/gateway \
 && node scripts/smoke-health-routes.mjs \
 && node -e "require('@ai-assistant/telemetry/register');require('@ai-assistant/auth');require('@ai-assistant/database');require('fs').accessSync('dist/index.js')"

ENV NODE_ENV=production
ENV INTELLIGENCE_UPSTREAM_URL=http://127.0.0.1:8000
ENV PYTHONPATH=/app/services/ai-runtime
ENV PORT=10000

# Container defaults: keep startup lightweight; optional probes stay disabled unless overridden.
ENV HEALTH_MONITOR_ENABLED=false
ENV CAPABILITY_PROBE_ENABLED=false

EXPOSE 10000

CMD ["supervisord", "-c", "/app/infra/supervisor/supervisord.conf"]
