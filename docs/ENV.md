# Environment files

| File | Purpose |
|------|---------|
| `.env` | **Local development** (Docker Postgres/Redis/Qdrant on localhost) |
| `.env.production` | **Production values** (Render URLs, Neon, Qdrant Cloud) — gitignored |
| `.env.example` | Template for local — committed |
| `.env.production.example` | Template for production — committed |

## Setup

```bash
pnpm env:setup
```

Creates/merges `.env`, `.env.production`, `apps/mobile/.env`, `apps/mobile/.env.production`.

## Which file loads when

Node (`@ai-assistant/config`) and Python (`ai-runtime`, `cognitive-runtime`) load:

1. `ENV_FILE` if set (e.g. `ENV_FILE=.env.production`)
2. `.env.production` when `NODE_ENV=production` or `RENDER=true`
3. Otherwise `.env`

**Render:** env vars are set in the dashboard (no file on disk). Same keys as `.env.production`.

## Mobile

| File | `EXPO_PUBLIC_API_URL` |
|------|------------------------|
| `apps/mobile/.env` | `http://localhost:3000` |
| `apps/mobile/.env.production` | `https://ai-assistant-462r.onrender.com` |

EAS production builds should use `.env.production` or set `EXPO_PUBLIC_API_URL` in EAS secrets.

## Render services

Copy from `.env.production` into each service:

- **ai-assistant-gateway** — full gateway block (DB, Redis, R2, auth, URLs)
- **ai-assistant-cognitive** — `API_PUBLIC_URL`, `AI_SERVICE_URL`, `INTERNAL_SERVICE_TOKEN`, provider keys
- **ai-assistant-ai** — `QDRANT_*`, provider keys

Canonical public gateway URL: **`API_PUBLIC_URL`** (replaces duplicate `GATEWAY_URL` / `API_URL` / `BETTER_AUTH_URL` in new configs).

## Google OAuth

| Variable | Used for |
|----------|----------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Better Auth sign-in |
| `GOOGLE_INTEGRATION_CLIENT_ID` / `GOOGLE_INTEGRATION_CLIENT_SECRET` | Gmail, Calendar, Drive (falls back to `GOOGLE_*` if unset) |

Register redirect URIs in Google Cloud Console:

- Sign-in: `{API_PUBLIC_URL}/api/auth/callback/google`
- Integrations: `{API_PUBLIC_URL}/integrations/google/callback`

On Render, set all four keys on **ai-assistant-gateway** (plus `INTEGRATION_ENCRYPTION_KEY` for stored tokens).
