# Verification checklist (release gate)

Run this after implementing or modifying the AI + integrations pipeline.

## Infrastructure

- `tilt up` shows healthy: `gateway`, `tool-runtime`, `cognitive-runtime`, `skill-runtime`, `ai-runtime`, `redis`, `postgres-db`.
- `GET http://localhost:3011/health` → ok
- `GET http://localhost:3013/health` → ok

## Security / isolation

- `GET /internal/whatsapp/health` without `X-Internal-Token` → **403**
- Tool execution cannot use another user’s `connectionId` (cross-user test).
- RAG retrieval is scoped by `user_id` (no cross-user results).

## Connect Apps → tools

- Connect app → connection becomes `ACTIVE`
- Google OAuth: `GET /integrations/google/callback` works **without** session cookie (valid `state` from connect)
- After OAuth, app opens `ai-assistant://integrations?connected=google` and list refreshes
- `GET http://localhost:3011/v1/tools/available?userId=<id>` returns tools only for connected providers
- `GET http://localhost:3014/v1/integrations/manifest?userId=<id>` returns `plannerText` with capability descriptions
- Disconnect app → its tools disappear from manifest and `/tools/available`

## Chat: tools + confirmation

- Ask “what apps are connected?” → reply lists ACTIVE providers from manifest (not invented apps)
- “send message …” triggers `chat:action_confirm_required`
- Confirm → tool executes → assistant responds

## Voice: same pipeline

- **ffmpeg + ffprobe** on PATH where **ai-runtime** runs (`python scripts/verify-ffmpeg.py`)
- Voice transcription → emits `chat:message` with `source: voice`
- Same confirmation and execution path as chat
- Silent mic test: record without speaking → **No speech detected** (no random STT text)

## NVIDIA models (ai-runtime)

Prerequisites: `NVIDIA_API_KEY` in repo-root `.env` (never commit keys).

1. `python scripts/verify-nvidia-models.py` — lists integrate models, smoke embed + rerank + nemotron-mini chat.
2. Short chat in app or `POST /v1/chat/stream` — logs should show `nvidia/glm-5.1` or `nvidia/mistral-nemotron` for `fast_chat`.
3. Reasoning prompt — chain uses `nvidia/glm-5.1` → `nvidia/mistral-nemotron` when NVIDIA key is set.
4. Image attachment — vision chain uses `google/paligemma` → `nvidia/llama-4-maverick-17b-128e-instruct` (Tier C).
5. Voice STT — upload normalized to 16 kHz mono WAV via ffmpeg (`models/voice/`), then Pollinations Whisper → `google/gemma-3n-e4b-it` fallback.
6. RAG: ingest/search uses `kb_documents_nv` + `nv-embed-v1` + rerank on every turn by default; cognitive-runtime logs `rag_ms` once per turn. Disable with `RAG_ENABLED=false` if needed.
7. Unset `NVIDIA_API_KEY` — text/voice fall back to Pollinations per `config/ai-models.yaml`.

## Automated gate

Run: `pnpm --filter @ai-assistant/gateway test:integration`

