# AI Assistant Platform

AI-native assistant with streaming chat, memory, multi-agent orchestration, voice, and cross-platform clients.

## Architecture

```
Mobile / Web  →  API Gateway (Fastify)  →  PostgreSQL
                      ↓
                 Socket.IO  →  AI Service (FastAPI)  →  Qdrant / LiteLLM
```

| Layer | Tool |
|-------|------|
| Runtime orchestration | [Tilt](https://tilt.dev) |
| Containers | Docker Compose |
| API | Fastify (`services/api`) |
| AI | FastAPI (`services/ai`) |
| Database | PostgreSQL |
| Cache / events | Redis |
| Vector DB | Qdrant |
| Metrics | Prometheus |
| Dashboards / logs | Grafana + Loki |
| AI tracing | Langfuse (optional profile) |
| Distributed traces | OpenTelemetry |

## Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+ (AI service virtualenv at `services/ai/venv`)
- Docker Desktop
- [Tilt](https://docs.tilt.dev/install.html) — `choco install tilt` (Windows, admin shell) or `brew install tilt` (macOS)

## Primary workflow — Tilt

Tilt is the recommended dev orchestrator (closest equivalent to Aspire for this stack).

```powershell
# One-time setup
pnpm env:setup
pnpm install
pnpm db:migrate

# Default: core infra + API + AI (allocates ports → tilt_config.json, picks free Tilt UI port)
pnpm tilt:up

# Or explicit profiles
pnpm tilt:up -- --services=core            # postgres, redis, qdrant only
pnpm tilt:up -- --services=api,ai          # lean app stack (default)
pnpm tilt:up -- --services=monitoring      # core + prometheus/grafana/loki/otel-collector
pnpm tilt:up -- --services=observability   # core + monitoring + Langfuse (no api/ai)
pnpm tilt:up -- --services=full            # core + api + ai + monitoring + Langfuse + web
pnpm tilt:up -- --services=apps            # core + api + web (+ mobile manual trigger)

pnpm tilt:down
```

Open the Tilt dashboard at the URL printed on start (port is in `tilt_config.json` as `tilt-port`, default **10350** if free). Use **Ctrl+C** in the `tilt:up` terminal to exit Tilt; `pnpm tilt:down` deletes Docker resources ([docs](https://docs.tilt.dev/cli/tilt_down.html)).

| Resource | Notes |
|----------|--------|
| `mobile` | Starts automatically with `tilt up` (Expo web on `mobile-port` in `tilt_config.json`) |
| `langfuse` | Only with `--services=full` (heavy on Windows) |

### Ports

Ports are stored in **`tilt_config.json`** (gitignored). `pnpm tilt:up` runs `node scripts/ports.mjs ensure` to pick free ports per clone (see [Tiltfile config](https://docs.tilt.dev/tiltfile_config.html)). Override in that file or via `tilt up -- --api-port=3100`, etc.

| Service | Default |
|---------|---------|
| Tilt UI | 10350 (`tilt up --port` / `TILT_PORT`) |
| API Gateway | 3000 |
| AI Orchestrator | 8000 |
| Prisma Studio | 5556 |
| Web dashboard | 3002 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Qdrant | 6333 |
| Prometheus | 9090 |
| Loki | 3100 |
| OTLP (collector) | 4318 |

Health: `GET /health`, `GET /health/ready` on API (`:3000`) and AI (`:8000`).

## Fallback workflow — manual terminals

For CI or environments without Tilt:

All Docker commands use project name `ai-assistant` (same as Tilt) so CLI and Tilt do not spawn duplicate containers.

```bash
pnpm docker:up              # core only (postgres, redis, qdrant)
pnpm docker:up:monitoring   # core + prometheus/grafana/loki
pnpm docker:up:full         # everything including Langfuse
pnpm docker:down            # tears down full stack

pnpm dev:api                # terminal 1
pnpm dev:ai                 # terminal 2
pnpm dev:web                # optional
pnpm --filter @ai-assistant/mobile dev   # optional
```

## Verification

```bash
pnpm docker:up
pnpm db:migrate
pnpm dev:api
pnpm dev:ai
pnpm test:integration   # must print SUCCEEDED
```

## Monorepo layout

```
apps/mobile          Expo React Native client
apps/web             Next.js dashboard
services/api         Fastify API + Socket.IO + Better Auth
services/ai          FastAPI RAG + agents + voice
packages/types       Shared API & client TypeScript types
packages/database    Prisma + PostgreSQL
packages/auth        Better Auth configuration
packages/config      Shared environment loader (all runtimes)
packages/telemetry   OpenTelemetry bootstrap
packages/events      Redis pub/sub domain events
packages/sdk         Client SDK for mobile/web
infra/docker/        Layered compose files
infra/tilt/          Tilt modules
infra/monitoring/    Prometheus, Grafana, Loki, OTel collector
```

## Infrastructure compose layers

| File | Contents |
|------|----------|
| `infra/docker/compose.core.yml` | postgres, redis, qdrant |
| `infra/docker/compose.monitoring.yml` | prometheus, grafana, loki, promtail, otel-collector |
| `infra/docker/compose.ai.yml` | Langfuse stack |
| `infra/docker/compose.dev.yml` | includes all layers |

`infra/docker/docker-compose.yml` is a shim that includes `compose.core.yml` only.

## Voice assistant (AI pipeline)

Voice mode is a full **STT → LLM → TTS** pipeline through the API and AI service (not on-device speech models):

| Stage | Mobile | API | AI service |
|-------|--------|-----|------------|
| Listen | `expo-audio` + VAD (`useVoiceTurnRecorder`) | — | — |
| STT | Socket `voice:turn_*` or HTTP `/voice/transcribe` | `socket/voice-turn.ts` (async) | `POST /v1/voice/transcribe` |
| Think | Socket `chat:message` (non-blocking handler) | `chat.service.ts` | `POST /v1/chat/stream` (SSE) |
| Speak | Sentence TTS queue (`voice-playback.ts`) | `POST /voice/speak` + rate limits | `POST /v1/voice/speak` (`asyncio.to_thread`) |

Configure providers via root `.env`: `TRANSCRIPTION_*`, `TEXT_MODEL`, `OPENAI_API_KEY`, `POLLINATIONS_API_KEY`, `SPEECH_VOICE`, `VOICE_MODE`, etc. (see `.env.example`).

**Provider routing:** AI service uses capability-based routers (`services/ai/orchestration/`, `services/ai/docs/ARCHITECTURE.md`). Pollinations is Tier-3 fallback only — not used for realtime duplex voice. Mobile never calls providers directly.

**Assistant APIs:** `GET /assistant/personalities`, `POST /assistant/context/evaluate`, `POST /assistant/proactive/score`, `GET /assistant/voice/mode`, `POST /assistant/voice/live/token` (stubs for Phase 4 Live).

**Multi-user / production:** run multiple stateless API replicas and AI workers behind a load balancer. The API applies **tiered rate limits** on all routes (IP + per-user): global traffic, auth endpoints, standard REST, AI-heavy routes, socket chat, and voice STT/TTS. Tune via `RATE_LIMIT_*` env vars (see `.env.example`). For multi-instance deployments, replace the in-memory limiter with Redis (same key scheme: `tier:subject`). Redis is used for automation events today; a dedicated voice job queue can be added later for backpressure.

## Mobile & Android

Full setup: **[apps/mobile/README.md](apps/mobile/README.md)**.

```bash
pnpm env:setup && pnpm install && pnpm docker:up && pnpm db:migrate
cp apps/mobile/.env.example apps/mobile/.env
pnpm dev:api
pnpm dev:ai
pnpm --filter @ai-assistant/mobile dev
```

Dev API URL: `http://localhost:3000` in `apps/mobile/.env`. On Android, run `adb reverse tcp:3000 tcp:3000` (see [apps/mobile/README.md](apps/mobile/README.md)).

## Web dashboard

```bash
pnpm dev:web
```

Runs on http://localhost:3001

## Future: Dapr

Not included in this phase. Consider Dapr later for service discovery, durable workflows, and distributed AI orchestration when the platform outgrows local Tilt + Compose.
