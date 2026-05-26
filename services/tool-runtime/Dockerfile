FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services/tool-runtime ./services/tool-runtime
RUN corepack enable && pnpm install --filter @ai-assistant/tool-runtime...
WORKDIR /app/services/tool-runtime
RUN pnpm build
EXPOSE 3011
CMD ["node", "dist/index.js"]
