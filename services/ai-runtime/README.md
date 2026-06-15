# AI Runtime

Python FastAPI service for chat streaming, planner, model routing, RAG, and voice.

## Layout

| Path | Role |
|------|------|
| `agent/` | Request kernel, context assembly, turn handling |
| `agents/` | Supervisor / multi-agent orchestration |
| `api/` | FastAPI routers (`/v1/chat`, `/v1/models`, health) |
| `llm/` | Provider routing, ranking, Redis health, streaming |
| `models/` | YAML catalog loader, selectable model API, resolvers |
| `orchestration/` | Planner pipeline and tool execution glue |
| `voice/` | Speech capture, TTS, transcription helpers |
| `voice_orchestration/` | Higher-level voice session flows |
| `models/voice/` | Voice-specific model adapters |

`agent/` and `agents/` are intentionally separate: kernel vs supervisor layers.

## Dev

From repo root (Tilt / env ports):

```bash
pnpm dev:ai-runtime
```

Or from this directory:

```bash
pnpm dev
pnpm test
```

Python **3.12** (see `runtime.txt` and root `Dockerfile`).
