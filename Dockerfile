
FROM node:22-bookworm AS node_deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY packages ./packages

COPY apps/mobile/package.json ./apps/mobile/
COPY apps/mobile/modules/overlay/package.json ./apps/mobile/modules/overlay/
COPY apps/web/package.json ./apps/web/
COPY services/ai-runtime/package.json ./services/ai-runtime/
COPY services/browser-runtime/package.json ./services/browser-runtime/
COPY services/capability-runtime/package.json ./services/capability-runtime/
COPY services/cognitive-runtime/package.json ./services/cognitive-runtime/
COPY services/event-bus/package.json ./services/event-bus/
COPY services/gateway/package.json ./services/gateway/
COPY services/reflection-engine/package.json ./services/reflection-engine/
COPY services/tool-runtime/package.json ./services/tool-runtime/
COPY services/workflow-engine/package.json ./services/workflow-engine/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM node:22-bookworm AS node_build
WORKDIR /app
RUN corepack enable
COPY --from=node_deps /app/node_modules ./node_modules
COPY --from=node_deps /app/patches ./patches
COPY . .
RUN pnpm catalog:generate && pnpm catalog:validate \
 && pnpm exec turbo run build \
    --filter=@ai-assistant/config \
    --filter=@ai-assistant/types \
    --filter=@ai-assistant/telemetry \
    --filter=@ai-assistant/events \
    --filter=@ai-assistant/tool-schema \
    --filter=@ai-assistant/permissions \
    --filter=@ai-assistant/capabilities \
    --filter=@ai-assistant/connectors \
    --filter=@ai-assistant/platform \
    --filter=@ai-assistant/workflows \
    --filter=@ai-assistant/integration-runtime \
    --filter=@ai-assistant/feature-flags \
    --filter=@ai-assistant/database \
    --filter=@ai-assistant/auth \
    --filter=@ai-assistant/gateway \
    --filter=@ai-assistant/sdk \
    --filter=@ai-assistant/tool-runtime \
    --filter=@ai-assistant/capability-runtime

FROM python:3.11-slim-bookworm AS python_deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY services/ai-runtime/requirements.txt ./services/ai-runtime/requirements.txt
COPY services/cognitive-runtime/requirements.txt ./services/cognitive-runtime/requirements.txt
RUN pip install --no-cache-dir -r services/ai-runtime/requirements.txt \
 && pip install --no-cache-dir -r services/cognitive-runtime/requirements.txt

FROM node:22-bookworm AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor ffmpeg python3 python3-pip \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY --from=node_build /app/node_modules ./node_modules
COPY --from=node_build /app/packages ./packages
COPY --from=node_build /app/services/gateway/dist ./services/gateway/dist
COPY --from=node_build /app/services/gateway/package.json ./services/gateway/package.json
COPY --from=node_build /app/services/tool-runtime/dist ./services/tool-runtime/dist
COPY --from=node_build /app/services/capability-runtime/dist ./services/capability-runtime/dist
COPY --from=python_deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python_deps /usr/local/bin /usr/local/bin
COPY services/ai-runtime ./services/ai-runtime
COPY services/cognitive-runtime ./services/cognitive-runtime
COPY connectors ./connectors
COPY catalog ./catalog
COPY planner-config ./planner-config
COPY infra/supervisor/supervisord.conf ./infra/supervisor/supervisord.conf
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

ENV NODE_ENV=production
ENV INTELLIGENCE_UPSTREAM_URL=http://127.0.0.1:8000
ENV PYTHONPATH=/app/services/ai-runtime:/app/services/cognitive-runtime

EXPOSE 10000
ENV API_PORT=10000
ENV PORT=10000

CMD ["supervisord", "-c", "/app/infra/supervisor/supervisord.conf"]
