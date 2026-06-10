FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services/skill-runtime ./services/skill-runtime
COPY skills ./skills
COPY services/cognitive-runtime/capability_manifest.json ./services/cognitive-runtime/capability_manifest.json
RUN corepack enable && pnpm install --filter @ai-assistant/skill-runtime...
WORKDIR /app/services/skill-runtime
RUN pnpm build
EXPOSE 3014
CMD ["node", "dist/index.js"]
