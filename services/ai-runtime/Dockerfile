FROM node:22-bookworm AS catalog
WORKDIR /app
RUN corepack enable
COPY . .
COPY .docker.npmrc ./.npmrc
RUN pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm catalog:generate && pnpm catalog:validate

FROM python:3.12-slim-bookworm AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY services/ai-runtime/requirements.txt ./services/ai-runtime/requirements.txt
RUN pip install --no-cache-dir -r services/ai-runtime/requirements.txt

FROM python:3.12-slim-bookworm AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY services/ai-runtime ./services/ai-runtime
COPY --from=catalog /app/services/ai-runtime/capability_manifest.json ./services/ai-runtime/capability_manifest.json
COPY catalog ./catalog
COPY planner-config ./planner-config

ENV NODE_ENV=production
ENV PYTHONPATH=/app/services/ai-runtime
ENV AI_HOST=0.0.0.0
ENV INTELLIGENCE_HOST=0.0.0.0
ENV AI_PORT=8000
ENV HEALTH_MONITOR_ENABLED=false
ENV CAPABILITY_PROBE_ENABLED=false
ENV WARM_EMBEDDER_ON_STARTUP=false
ENV WARM_AGENT_MODULES=false

RUN BETTER_AUTH_SECRET=docker-build-smoke-test-only-not-used-at-runtime-00 \
 && test -f /app/services/ai-runtime/capability_manifest.json \
 && test -f /app/services/ai-runtime/orchestration/agent_pipeline.py \
 && uvicorn --version \
 && cd /app/services/ai-runtime \
 && PYTHONPATH=/app/services/ai-runtime python -c "from main import app; assert '/health' in app.openapi().get('paths', {})"

EXPOSE 8000

WORKDIR /app/services/ai-runtime
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
