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

EAS project ID: `e571137a-6ce6-4d5f-bba1-ee812975eb4a` (see `apps/mobile/app.config.ts`).

### Mobile version / update policy (gateway)

**Version numbers (auto):** Gateway reads [`apps/mobile/release-manifest.json`](../apps/mobile/release-manifest.json). After each production EAS Android build, `sync-mobile-release.mjs` runs automatically (semver from `app.config.ts`, `versionCode` from EAS `autoIncrement`). Commit the updated manifest and redeploy the gateway (or any deploy that includes the repo).

```bash
pnpm mobile:release:sync          # manual sync from app.config.ts
pnpm mobile:release:sync --from-eas  # pull versionCode from EAS remote
```

Force older installs to update after a native release:

```bash
node scripts/sync-mobile-release.mjs --from-eas --promote-min
```

Set on **ai-assistant-gateway** (Render env or `.env.production`):

| Variable | Purpose |
|----------|---------|
| `MOBILE_LATEST_VERSION` | Optional override (default: manifest) |
| `MOBILE_MIN_VERSION` | Optional override (default: manifest) |
| `MOBILE_MIN_ANDROID_VERSION_CODE` | Optional override (default: manifest) |
| `MOBILE_ANDROID_PLAY_STORE_URL` | Play Store listing URL (required for store modal link) |
| `MOBILE_ANDROID_APK_URL` | Direct APK URL for internal testers |
| `MOBILE_UPDATE_URL_MODE` | `play`, `apk`, or `auto` (prefer Play if set, else APK) |

Public endpoint: `GET {API_PUBLIC_URL}/mobile/version` (no auth).

## Render services

Copy from `.env.production` into each service:

- **ai-assistant-gateway** — full gateway block (DB, Redis, R2, auth, URLs) + `TOOL_RUNTIME_URL`, `SKILL_RUNTIME_URL`
- **ai-assistant-cognitive** — `API_PUBLIC_URL`, `AI_SERVICE_URL`, `INTERNAL_SERVICE_TOKEN`, `TOOL_RUNTIME_URL`, `SKILL_RUNTIME_URL`, provider keys
- **ai-assistant-ai** — `QDRANT_*`, provider keys
- **ai-assistant-tool-runtime** — `SKIP_INSTALL_DEPS=true`, `DATABASE_URL`, `INTEGRATION_ENCRYPTION_KEY`, Google integration keys. Build: `npx pnpm@9.0.0 install --frozen-lockfile && npx pnpm@9.0.0 run build:tool-runtime`. Start: `pnpm run start:tool-runtime`
- **ai-assistant-skill-runtime** — `SKIP_INSTALL_DEPS=true`, `TOOL_RUNTIME_URL`. Build: `npx pnpm@9.0.0 install --frozen-lockfile && npx pnpm@9.0.0 run build:skill-runtime`. Start: `pnpm run start:skill-runtime`

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
