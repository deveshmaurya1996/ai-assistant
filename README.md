# AI Assistant Platform

AI-native assistant with streaming chat, memory, multi-agent orchestration, voice, and cross-platform clients.

For full AI implementation context (chat, tools, voice, RAG, models, file map), see **[docs/CORE_AI_README.md](docs/CORE_AI_README.md)**.

For the AI OS evolution roadmap (capabilities, connectors, renames), see **[docs/AI_OS_EVOLUTION.md](docs/AI_OS_EVOLUTION.md)**.

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
| API | Fastify (`services/gateway`) |
| AI | FastAPI (`services/ai-runtime`) |
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
- Python 3.11+ (AI service virtualenv at `services/ai-runtime/venv`)
- Docker Desktop
- [Tilt](https://docs.tilt.dev/install.html) — `choco install tilt` (Windows, admin shell) or `brew install tilt` (macOS)

## Primary workflow — Tilt

Tilt is the recommended dev orchestrator (closest equivalent to Aspire for this stack).

```powershell
# One-time: pnpm install creates .env files, builds workspace, validates connectors/planner
pnpm install

# Default: core infra + API + AI (starts Docker Desktop if needed, then Tilt + db-setup)
pnpm dev

# Or explicit profiles
pnpm dev -- --services=core            # postgres, redis, qdrant only
pnpm dev -- --services=api,ai-runtime   # lean app stack (default)
pnpm dev -- --services=monitoring      # core + prometheus/grafana/loki/otel-collector
pnpm dev -- --services=observability   # core + monitoring + Langfuse (no api/ai)
pnpm dev -- --services=full            # core + api + ai + monitoring + Langfuse + web
pnpm dev -- --services=apps            # core + api + web (+ mobile manual trigger)

pnpm dev:down
```

Open the Tilt dashboard at the URL printed on start (port is in `tilt_config.json` as `tilt-port`, default **10350** if free). Use **Ctrl+C** in the `pnpm dev` terminal to exit Tilt; `pnpm dev:down` deletes Docker resources ([docs](https://docs.tilt.dev/cli/tilt_down.html)).

| Resource | Notes |
|----------|--------|
| `mobile` | Starts automatically with `tilt up` (Expo web on `mobile-port` in `tilt_config.json`) |
| `langfuse` | Only with `--services=full` (heavy on Windows) |

### Ports

Ports are stored in **`tilt_config.json`** (gitignored). `pnpm dev` waits for Docker (starting Docker Desktop on Windows/macOS if needed), then runs `node scripts/ports.mjs ensure` to pick free ports per clone (see [Tiltfile config](https://docs.tilt.dev/tiltfile_config.html)). Override in that file or via `pnpm dev -- --api-port=3100`, etc. Set `SKIP_DOCKER_ENSURE=1` to skip auto-start (e.g. CI); set `DOCKER_DESKTOP_PATH` if Docker is installed in a non-default location.

| Service | Default |
|---------|---------|
| Tilt UI | 10350 (`tilt up --port` / `TILT_PORT`) |
| API Gateway | 3000 |
| Intelligence (ai-runtime) | 8000 |
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
pnpm docker up              # core only (postgres, redis, qdrant)
pnpm docker up monitoring   # core + prometheus/grafana/loki
pnpm docker up full         # everything including Langfuse
pnpm docker down            # tears down full stack

pnpm dev:gateway            # terminal 1
pnpm dev:ai-runtime         # terminal 2
pnpm dev:web                # optional
pnpm --filter @ai-assistant/mobile dev   # optional
```

## Verification

```bash
pnpm docker up
pnpm db:migrate
pnpm dev:gateway
pnpm dev:ai-runtime
pnpm test:integration   # must print SUCCEEDED
pnpm verify planner     # connectors sync + planner heuristic eval (also runs on install)
pnpm catalog:validate   # catalog YAML consistency
```

## Monorepo layout

```
apps/mobile          Expo React Native client
apps/web             Next.js dashboard
services/gateway            Fastify API + Socket.IO + workers
services/ai-runtime         Intelligence — models, RAG, voice
services/cognitive-runtime  Planner + executor (Python library, mounted in ai-runtime)
services/capability-runtime Capability execution (in-process in gateway)
services/tool-runtime       Tool executor library (in-process in gateway)
catalog/             Single source of truth (providers, capabilities, tools, policy)
planner-config/      Planner prompts and AI model YAML
connectors/          Connector playbooks (meta.json + PLAYBOOK.md per app)
packages/catalog-codegen  Generates registries from catalog/
packages/capabilities     Generated capability registry + planner manifest
packages/tool-schema      Tool definitions (Zod in tool-schemas.ts, metadata from catalog)
packages/integration-runtime  OAuth/API runtime (Google, WhatsApp)
packages/platform           Platform tools (contacts, resources)
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

**Provider routing:** AI service uses capability-based routers (`services/ai-runtime/orchestration/`, `services/ai-runtime/docs/ARCHITECTURE.md`). Pollinations is Tier-3 fallback only — not used for realtime duplex voice. Mobile never calls providers directly.

**Assistant APIs:** `GET /assistant/personalities`, `POST /assistant/context/evaluate`, `POST /assistant/proactive/score`, `GET /assistant/voice/mode`, `POST /assistant/voice/live/token` (stubs for Phase 4 Live).

**Multi-user / production:** run multiple stateless API replicas and AI workers behind a load balancer. The API applies **tiered rate limits** on all routes (IP + per-user): global traffic, auth endpoints, standard REST, AI-heavy routes, socket chat, and voice STT/TTS. Tune via `RATE_LIMIT_*` env vars (see `.env.example`). For multi-instance deployments, replace the in-memory limiter with Redis (same key scheme: `tier:subject`). Redis is used for automation events today; a dedicated voice job queue can be added later for backpressure.

## Mobile & Android

Full setup: **[apps/mobile/README.md](apps/mobile/README.md)**.

```bash
pnpm install          # creates .env files + builds + validates
pnpm docker up
pnpm db:migrate
pnpm dev:gateway
pnpm dev:ai-runtime
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
