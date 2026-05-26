# Verification checklist (release gate)

Run this after implementing or modifying the AI + integrations pipeline.

## Infrastructure

- `tilt up` shows healthy: `api`, `tool-runtime`, `ai-orchestrator`, `ai`, `redis`, `postgres-db`.
- `GET http://localhost:3011/health` → ok
- `GET http://localhost:3013/health` → ok

## Security / isolation

- `GET /internal/whatsapp/health` without `X-Internal-Token` → **403**
- Tool execution cannot use another user’s `connectionId` (cross-user test).
- RAG retrieval is scoped by `user_id` (no cross-user results).

## Connect Apps → tools

- Connect app → connection becomes `ACTIVE`
- `GET /tools/available` returns tools only for connected providers
- Disconnect app → its tools disappear

## Chat: tools + confirmation

- “send message …” triggers `chat:action_confirm_required`
- Confirm → tool executes → assistant responds

## Voice: same pipeline

- Voice transcription → emits `chat:message` with `source: voice`
- Same confirmation and execution path as chat

## Automated gate

Run: `pnpm --filter @ai-assistant/api test:integration`

