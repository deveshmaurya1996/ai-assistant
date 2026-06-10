# Environment files

| File | Purpose |
|------|---------|
| `.env` | **Local development** (Tilt / localhost) |
| `.env.production` | **Production reference** (Render URLs, Neon, etc.) — gitignored |
| `.env.example` | Local template — committed |
| `.env.production.example` | Production template + per-service Render blocks — committed |

## Setup

```bash
pnpm env:setup
```

Merges new keys from `*.example` into your existing `.env` / `.env.production` without overwriting secrets.

## Which file loads when

Node (`@ai-assistant/config`) and Python (`ai-runtime`, `cognitive-runtime`):

1. `ENV_FILE` if set
2. `.env.production` when `NODE_ENV=production`
3. Otherwise `.env`

**Render:** set vars in each service's dashboard (no file on disk). Use `.env.production` as your copy-paste source.

## Service URL map

| Variable | Local (Tilt) | Production (Render) |
|----------|--------------|-------------------|
| `API_PUBLIC_URL` | `http://localhost:3000` | `https://ai-assistant-462r.onrender.com` |
| `AI_SERVICE_URL` | `http://localhost:8000` | `https://ai-assistant-ai.onrender.com` |
| `COGNITIVE_RUNTIME_URL` | `http://localhost:3013` | `https://ai-assistant-cognitive.onrender.com` |
| `TOOL_RUNTIME_URL` | `http://localhost:3011` | `https://ai-assistant-tool-runtime.onrender.com` |
| `SKILL_RUNTIME_URL` | `http://localhost:3014` | `https://ai-assistant-skill-runtime.onrender.com` |

Node version: `.node-version` in repo root (22). Render reads it automatically.

## Render — what goes on each service

### ai-assistant-gateway

Full `.env.production` gateway block: DB, Redis, R2, auth, all URLs above, Google OAuth, WhatsApp, mobile policy.

**Object storage (R2):** Set `STORAGE_BACKEND=r2` and `R2_*` on **ai-assistant-gateway**. All durable blobs use the same bucket via `@ai-assistant/storage`:

| R2 prefix | Purpose |
|-----------|---------|
| User file keys from `buildUserFileKey` | Chat attachments, uploads |
| `wa-auth/{sessionId}/` | WhatsApp Baileys session + `session.json` (synced on save; restored on gateway boot) |

`WHATSAPP_AUTH_DIR` is a **local cache** for Baileys (default `data/wa-auth`). On Render it is ephemeral; credentials persist in R2 when `STORAGE_BACKEND=r2`. No Render persistent disk is required.

Local dev with `STORAGE_BACKEND=local` keeps WhatsApp auth files only on disk under `WHATSAPP_AUTH_DIR`.

### ai-assistant-cognitive

```
API_PUBLIC_URL
AI_SERVICE_URL
INTERNAL_SERVICE_TOKEN
TOOL_RUNTIME_URL
SKILL_RUNTIME_URL
ORCHESTRATOR_STREAM_TIMEOUT
NVIDIA_API_KEY
NVIDIA_SECOND_API_KEY
GROQ_API_KEY
POLLINATIONS_API_KEY
```

### ai-assistant-ai

```
QDRANT_URL
QDRANT_API_KEY
NVIDIA_API_KEY
NVIDIA_SECOND_API_KEY
GROQ_API_KEY
POLLINATIONS_API_KEY
VOICE_MODE
VOICE_STT_PROVIDER
SPEECH_VOICE
```

### ai-assistant-tool-runtime

```
SKIP_INSTALL_DEPS=true
NODE_ENV=production
DATABASE_URL
INTEGRATION_ENCRYPTION_KEY
INTERNAL_SERVICE_TOKEN
API_PUBLIC_URL
GOOGLE_INTEGRATION_CLIENT_ID
GOOGLE_INTEGRATION_CLIENT_SECRET
```

Build: `npx pnpm@9.0.0 install --frozen-lockfile && npx pnpm@9.0.0 run build:tool-runtime`  
Start: `pnpm run start:tool-runtime`  
Health: `/health`

### ai-assistant-skill-runtime

```
SKIP_INSTALL_DEPS=true
NODE_ENV=production
TOOL_RUNTIME_URL
```

Build: `npx pnpm@9.0.0 install --frozen-lockfile && npx pnpm@9.0.0 run build:skill-runtime`  
Start: `pnpm run start:skill-runtime`  
Health: `/health`

## Secrets that must match

| Variable | Must be identical on |
|----------|----------------------|
| `INTERNAL_SERVICE_TOKEN` | gateway, cognitive, tool-runtime |
| `INTEGRATION_ENCRYPTION_KEY` | gateway, tool-runtime |
| `DATABASE_URL` | gateway, tool-runtime |

## Mobile

| File | `EXPO_PUBLIC_API_URL` |
|------|------------------------|
| `apps/mobile/.env` | `http://localhost:3000` |
| `apps/mobile/.env.production` | `https://ai-assistant-462r.onrender.com` |

Diagnostics (requires login): `GET {API_PUBLIC_URL}/agents/diagnostics`

## Google OAuth

| Variable | Used for |
|----------|----------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Better Auth sign-in |
| `GOOGLE_INTEGRATION_CLIENT_ID` / `GOOGLE_INTEGRATION_CLIENT_SECRET` | Gmail, Calendar, Drive |

Redirect URIs in Google Cloud Console:

- Sign-in: `{API_PUBLIC_URL}/api/auth/callback/google`
- Integrations: `{API_PUBLIC_URL}/integrations/google/callback`
