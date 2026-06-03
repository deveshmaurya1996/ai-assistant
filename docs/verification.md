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
- **Fast small talk:** “hi”, “how are you”, “what is your name?” — first token &lt; 2s locally; cognitive logs `intent=casual` with no `manifest_ms` / `plan_tools_ms`. Ensure `RAG_ROUTER_MODE` is not `llm` in `.env`.
- **Fast memory recall:** “what did we discuss about X?” / “do you remember …?” — cognitive logs `intent=memory`; status or first token &lt; 500ms (`MEMORY_PRESTREAM_BUDGET_MS=300`); full grounded reply &lt; 4s. Mobile may show “Checking your saved memories…” briefly. Keep `rag.rerankEnabled: false` in `config/ai-models.yaml` unless you need rerank quality.
- **Attachments (read-only):** upload PDF + “summarize this” — `intent=knowledge`, `stream_task=attachment_read`, no `manifest_ms` / `plan_tools_ms`; gateway `firstTokenMs` ideally &lt; 10s locally.
- **Attachment + pasted doc text:** same chat with long body containing “email” — still `intent=knowledge` (document mode).
- **Attachment + integration action:** “email this pdf to …” — `intent=tool`, status SSE before planner; confirm via `action_confirm` or JSON still works.
- **Per-chat file follow-up:** in one chat, upload a PDF, send 15+ unrelated messages, then “check the file” (no re-attach) — answer uses file content; logs show `session_context_chars` &gt; 0.
- **Saved memories:** Memory screen still shows global FACT/PREFERENCE only; episodic recall prefers current chat then other chats.
- **Parallel chats:** start a long reply in chat A, open chat B and send a message — A keeps streaming; B streams independently.
- **Assistant identity:** Settings → Friday preset → display name should be **Friday** (stale “Jarvis” from another preset is auto-corrected on load). Ask “what is your name?” / “who are you?” — answer uses Friday, not Jarvis or “no personal identity”. Switch to Jarvis preset → name and answers become Jarvis.

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
6. Layered memory: Qdrant indexes each turn (episodic); Memory UI shows **facts/preferences only** (not chat transcripts). “what did we discuss…” → episodic search when `RAG_RETRIEVAL_MODE=smart`; “hello” → no search. **Explicit remember:** `Remember: my company is Acme` → one Fact; repeat → same Fact updated. Short “hi” → no new memory row. Optional: `MEMORY_CLEANUP_CONVERSATION_ROWS=true` once to remove legacy Postgres chat rows. Ops: `RAG_ENABLED=false`, `RAG_RETRIEVAL_MODE=always`, `MEMORY_EXTRACTION_ENABLED=false`.
7. Unit tests: `pnpm --filter @ai-assistant/gateway test:unit`; `cd services/ai-runtime && python -m pytest tests/test_memory_extraction.py -q`.
8. Unset `NVIDIA_API_KEY` — text/voice fall back to Pollinations per `config/ai-models.yaml`.

## Automated gate

Run: `pnpm --filter @ai-assistant/gateway test:integration`

