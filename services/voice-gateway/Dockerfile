FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY patches ./patches

COPY packages ./packages
COPY services/voice-gateway ./services/voice-gateway

RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @ai-assistant/voice-gateway build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/patches ./patches
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/voice-gateway/dist ./services/voice-gateway/dist
COPY --from=build /app/services/voice-gateway/package.json ./services/voice-gateway/package.json

CMD ["node", "-r", "@ai-assistant/config/register", "services/voice-gateway/dist/index.js"]
