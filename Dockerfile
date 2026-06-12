
FROM node:22-bookworm AS pruner
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm exec turbo prune @ai-assistant/gateway --docker

FROM node:22-bookworm AS node_build
WORKDIR /app
RUN corepack enable
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY .docker.npmrc ./.npmrc
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .

ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
RUN pnpm catalog:generate && pnpm catalog:validate \
 && pnpm exec turbo run build --filter=@ai-assistant/gateway...

FROM python:3.11-slim-bookworm AS python_deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY services/ai-runtime/requirements.txt ./services/ai-runtime/requirements.txt
COPY services/cognitive-runtime/requirements.txt ./services/cognitive-runtime/requirements.txt
RUN pip install --no-cache-dir -r services/ai-runtime/requirements.txt \
 && pip install --no-cache-dir -r services/cognitive-runtime/requirements.txt

FROM python:3.11-slim-bookworm AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor ffmpeg curl ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

COPY --from=python_deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python_deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=node_build /app/node_modules ./node_modules
COPY --from=node_build /app/packages ./packages
COPY --from=node_build /app/services/gateway ./services/gateway
COPY --from=node_build /app/services/tool-runtime ./services/tool-runtime
COPY --from=node_build /app/services/capability-runtime ./services/capability-runtime
COPY --from=node_build /app/catalog ./catalog
COPY --from=node_build /app/connectors ./connectors
COPY --from=node_build /app/patches ./patches
COPY services/ai-runtime ./services/ai-runtime
COPY services/cognitive-runtime ./services/cognitive-runtime
COPY planner-config ./planner-config
COPY infra/supervisor/supervisord.conf ./infra/supervisor/supervisord.conf

ENV NODE_ENV=production
ENV INTELLIGENCE_UPSTREAM_URL=http://127.0.0.1:8000
ENV PYTHONPATH=/app/services/ai-runtime:/app/services/cognitive-runtime

EXPOSE 10000
ENV API_PORT=10000
ENV PORT=10000

CMD ["supervisord", "-c", "/app/infra/supervisor/supervisord.conf"]
