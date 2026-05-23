# AI Assistant Platform

AI-native assistant with streaming chat, memory, multi-agent orchestration, voice, and cross-platform clients.

## Architecture

```
Mobile / Web  →  API Gateway (Fastify)  →  PostgreSQL
                      ↓
                 Socket.IO  →  AI Service (FastAPI)  →  Qdrant / LiteLLM
```

| Service | Port | Path |
|---------|------|------|
| API Gateway | 3000 | `services/api` |
| AI Orchestrator | 8000 | `services/ai` |

Health checks: `GET http://localhost:3000/health`, `GET http://localhost:3000/health/ready`, `GET http://localhost:8000/health`
| PostgreSQL | 5432 | `infra/docker` |
| Redis | 6379 | `infra/docker` |
| Qdrant | 6333 | `infra/docker` (optional) |

## Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+ (AI service)
- Docker Desktop

## Quickstart

```bash
# Infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# Environment
cp .env.example packages/database/.env
cp .env.example services/api/.env

# Install & database
pnpm install
pnpm --filter @ai-assistant/database db:generate
pnpm --filter @ai-assistant/database db:migrate

# Terminal 1 — API
pnpm --filter @ai-assistant/api dev

# Terminal 2 — AI
pnpm dev:ai

# Terminal 3 — Mobile (optional)
pnpm --filter @ai-assistant/mobile dev
```

## Verification

Start infrastructure and services, then run the integration test:

```bash
pnpm docker:up
pnpm db:migrate
pnpm dev:api          # terminal 1
pnpm dev:ai           # terminal 2 (uses services/ai/venv)
pnpm test:integration # terminal 3 — must print SUCCEEDED
```

The test covers: Better Auth sign-up → RAG ingest → chat session → Socket.IO streaming → PostgreSQL persistence.

## Monorepo layout

```
apps/mobile          Expo React Native client
apps/web             Next.js dashboard (Phase 10)
services/api         Fastify API + Socket.IO + Better Auth
services/ai          FastAPI RAG + agents + voice
packages/database    Prisma + PostgreSQL
packages/auth        Better Auth configuration
packages/config      Shared environment config
packages/sdk         Client SDK for mobile/web
```

## Mobile & Android

Full setup (Android Studio, SDK/NDK, device pairing, first dev build, daily workflow): **[apps/mobile/README.md](apps/mobile/README.md)**.

Root `.npmrc` uses `node-linker=hoisted` so React Native native modules build on Windows (required for Reanimated/worklets).

### Quick start (Android physical device)

```bash
# One-time
pnpm env:setup
pnpm install
pnpm docker:up && pnpm db:migrate
cp apps/mobile/.env.example apps/mobile/.env   # set EXPO_PUBLIC_API_URL to your PC LAN IP

# Every session — 4 terminals
pnpm docker:up              # 1 — if not already up
pnpm dev:api                # 2 — API :3000
pnpm dev:ai                 # 3 — AI :8000 (chat/voice)
adb reverse tcp:3000 tcp:3000 && adb reverse tcp:8081 tcp:8081
pnpm --filter @ai-assistant/mobile dev   # 4 — Metro; open AI Assistant on phone
```

First native install (dev client, once per machine or after native changes):

```bash
cd apps/mobile && npx expo prebuild --platform android
pnpm mobile:android
```

| `EXPO_PUBLIC_API_URL` | Use when |
|------------------------|----------|
| `http://10.0.2.2:3000` | Android emulator |
| `http://<LAN-IP>:3000` | Physical device on Wi‑Fi |

## Web dashboard

```bash
pnpm --filter @ai-assistant/web dev
```

Runs on http://localhost:3001
