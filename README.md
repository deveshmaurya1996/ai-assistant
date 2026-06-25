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
- Python 3.12+ (AI service virtualenv at `services/ai-runtime/venv`)
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
| AI runtime (ai-runtime) | 8000 |
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

| Folder | Owns |
|--------|------|
| `apps/mobile` | Expo client, settings/model picker UI |
| `apps/web` | Next.js dashboard |
| `services/gateway` | Auth, settings API, Socket.IO bridge |
| `services/ai-runtime` | Model routing, planner, LLM, RAG, voice |
| `services/capability-runtime` | Capability execution (in-process in gateway) |
| `services/tool-runtime` | Tool executor library (in-process in gateway) |
| `packages/icons` | Iconify / LobeHub icon components |
| `packages/sdk` | Client SDK for mobile/web |
| `packages/types` | Shared API and client TypeScript types |
| `packages/storage` | File storage abstractions |
| `packages/file-processing` | Document text extraction |
| `packages/permissions` | Default policy codegen from catalog |
| `packages/workflows` | Workflow engine types/helpers |
| `packages/feature-flags` | Feature flag helpers |
| `catalog/` | Single source of truth (providers, capabilities, tools, policy) |
| `planner-config/` | Planner prompts and `ai-models.yaml` |
| `connectors/` | Connector playbooks (`meta.json` + `PLAYBOOK.md`) |
| `packages/catalog-codegen` | Generates registries from `catalog/` |
| `evals/` | Planner eval fixtures |
| `workspace/` | Assistant template files for users |
| `patches/` | pnpm patched dependencies |
| `infra/` | Docker Compose, Tilt, monitoring, supervisor |

```
apps/mobile          Expo React Native client
apps/web             Next.js dashboard
services/gateway     Fastify API + Socket.IO + workers
services/ai-runtime  AI runtime — models, RAG, voice, agent orchestration
services/capability-runtime  Capability execution (in-process in gateway)
services/tool-runtime        Tool executor library (in-process in gateway)
catalog/             Single source of truth (providers, capabilities, tools, policy)
planner-config/      Planner prompts and AI model YAML
connectors/          Connector playbooks (meta.json + PLAYBOOK.md per app)
packages/icons       Iconify/LobeHub icons for mobile
packages/catalog-codegen  Generates registries from catalog/
packages/capabilities     Generated capability registry + planner manifest
packages/tool-schema      Tool definitions (Zod in tool-schemas.ts, metadata from catalog)
packages/integration-runtime  OAuth/API runtime (Google, WhatsApp)
packages/platform         Platform tools (contacts, resources)
packages/types       Shared API & client TypeScript types
packages/database    Prisma + PostgreSQL
packages/auth        Better Auth configuration
packages/config      Shared environment loader (all runtimes)
packages/telemetry   OpenTelemetry bootstrap
packages/events      Redis pub/sub domain events
packages/sdk         Client SDK for mobile/web
packages/storage     Storage abstractions
packages/file-processing  Document extraction
packages/permissions Default policies (generated)
packages/workflows   Workflow helpers
packages/feature-flags  Feature flags
evals/               Planner evaluation cases
workspace/           User assistant templates
patches/             pnpm patched dependencies
infra/docker/        Layered compose files
infra/tilt/          Tilt modules
infra/monitoring/    Prometheus, Grafana, Loki, OTel collector
```

See also [docs/architecture.md](docs/architecture.md).

## Infrastructure compose layers

| File | Contents |
|------|----------|
| `infra/docker/compose.core.yml` | postgres, redis, qdrant |
| `infra/docker/compose.core.internal.yml` | same, no host ports (production) |
| `infra/docker/compose.production.yml` | internal infra + gateway + ai-runtime |
| `infra/docker/compose.monitoring.yml` | prometheus, grafana, loki, promtail, otel-collector |
| `infra/docker/compose.ai.yml` | Langfuse stack |
| `infra/docker/compose.dev.yml` | includes all layers |

`infra/docker/docker-compose.yml` is a shim that includes `compose.core.yml` only.

Production (OCI / self-hosted): see [infra/deploy/README.md](infra/deploy/README.md) — split **gateway** + **ai-runtime** containers, `compose.production.yml`, GitHub Actions → OCIR → VM deploy.

## Voice assistant (AI pipeline)

Voice mode is a full **STT → LLM → TTS** pipeline through the API and AI service (not on-device speech models):

| Stage | Mobile | API | AI service |
|-------|--------|-----|------------|
| Listen | `expo-audio` + VAD (`useVoiceTurnRecorder`) | — | — |
| STT | Socket `voice:turn_*` or HTTP `/voice/transcribe` | `socket/voice-turn.ts` (async) | `POST /v1/voice/transcribe` |
| Think | Socket `chat:message` (non-blocking handler) | `chat.service.ts` | `POST /v1/chat/stream` (SSE) |
| Speak | Sentence TTS queue (`voice-playback.ts`) | `POST /voice/speak` + rate limits | `POST /v1/voice/speak` (`asyncio.to_thread`) |

Configure voice services via root `.env`: `FASTER_WHISPER_URL`, `FASTER_WHISPER_MODEL`, `PIPER_URL`, `PIPER_DEFAULT_VOICE`, `SPEECH_VOICE`, `VOICE_MODE` (see `.env.example`).

**Provider routing:** AI service uses capability-based modules (`services/ai-runtime/orchestration/`, `services/ai-runtime/llm/`). Pollinations is Tier-3 fallback only — not used for realtime duplex voice. Mobile never calls providers directly.

### Voice Provider Defaults

```yaml
voiceProviders:
  stt:
    default: faster-whisper
  tts:
    default: piper
```

Backlog:

```yaml
- id: voice-provider-abstraction
  content: Add STTProvider and TTSProvider interfaces before production scale
  status: backlog
```

**Assistant APIs:** `GET /assistant/personalities`, `POST /assistant/context/evaluate`, `POST /assistant/proactive/score`, `GET /assistant/voice/mode` (proxies AI runtime), `POST /assistant/voice/live/token` (LiveKit token minting).

**Multi-user / production:** run multiple stateless API replicas and AI workers behind a load balancer. The API applies **tiered rate limits** on all routes (IP + per-user): global traffic, auth endpoints, standard REST, AI-heavy routes, socket chat, and voice STT/TTS. Tune via `RATE_LIMIT_*` env vars (see `.env.example`). For multi-instance deployments, replace the in-memory limiter with Redis (same key scheme: `tier:subject`). Redis is used for automation events today; a dedicated voice job queue can be added later for backpressure.

## Mobile & Android

Full setup: **[apps/mobile/README.md](apps/mobile/README.md)**.

```bash
pnpm install          # creates .env files + builds + validates
pnpm docker up voice  # postgres, redis, livekit, piper, faster-whisper
pnpm db:migrate
pnpm dev:gateway
pnpm dev:ai-runtime
pnpm dev:voice-gateway
pnpm --filter @ai-assistant/mobile dev
```

Voice requires **Piper** (Wyoming TCP on port 5000) and a **rebuilt voice-gateway** worker. `INTELLIGENCE_UPSTREAM_URL` must point at ai-runtime (**port 8000** in local dev). If welcome audio is silent, confirm `POST http://localhost:8000/v1/voice/speak` returns non-zero bytes and voice-gateway logs show `[voice-agent] welcome spoken` (not `fetch failed`).

Dev API URL: `http://localhost:3000` in `apps/mobile/.env`. On Android, run `adb reverse tcp:3000 tcp:3000` (see [apps/mobile/README.md](apps/mobile/README.md)).

## Web dashboard

```bash
pnpm dev:web
```

Runs on http://localhost:3001

## Future: Dapr

Not included in this phase. Consider Dapr later for service discovery, durable workflows, and distributed AI orchestration when the platform outgrows local Tilt + Compose.
