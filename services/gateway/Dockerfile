FROM node:22-bookworm AS pruner
WORKDIR /app
RUN corepack enable
COPY . .
COPY .docker.npmrc ./.npmrc
RUN pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm catalog:generate && pnpm catalog:validate \
 && pnpm exec turbo prune @ai-assistant/gateway --docker

FROM node:22-bookworm AS build
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

FROM node:22-bookworm AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/gateway ./services/gateway
COPY --from=build /app/services/tool-runtime ./services/tool-runtime
COPY --from=build /app/services/capability-runtime ./services/capability-runtime
COPY connectors ./connectors
COPY catalog ./catalog
COPY planner-config ./planner-config

RUN BETTER_AUTH_SECRET=docker-build-smoke-test-only-not-used-at-runtime-00 \
 && cd /app/services/gateway \
 && node scripts/smoke-health-routes.mjs \
 && node -e "require('@ai-assistant/telemetry/register');require('@ai-assistant/auth');require('@ai-assistant/database');require('fs').accessSync('dist/index.js')"

ENV API_PORT=10000
ENV PORT=10000
ENV INTELLIGENCE_UPSTREAM_URL=http://ai-runtime:8000
ENV NODE_OPTIONS=--max-old-space-size=256
ENV INGESTION_CONCURRENCY=1
ENV WORKFLOW_CONCURRENCY=1
ENV SCHEDULER_CONCURRENCY=1
ENV MEMORY_CONCURRENCY=1

EXPOSE 10000

WORKDIR /app/services/gateway
CMD ["node", "-r", "@ai-assistant/telemetry/register", "dist/index.js"]
