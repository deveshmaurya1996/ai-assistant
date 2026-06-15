# Architecture

High-level map of the AI Assistant monorepo. For setup and commands, see the [root README](../README.md).

## Request flow

```
Mobile / Web  →  Gateway (Fastify)  →  PostgreSQL / Redis
                      ↓
                 Socket.IO  →  AI Runtime (FastAPI)  →  Qdrant / LLM providers
```

## Folder ownership

| Folder | Owns |
|--------|------|
| `apps/mobile` | Expo client, chat UI, settings (model picker, assistants) |
| `apps/web` | Next.js admin/dashboard |
| `services/gateway` | REST + Socket.IO, auth, settings, chat proxy |
| `services/ai-runtime` | Planner, model routing, streaming, RAG, voice |
| `services/tool-runtime` | Tool execution library (gateway in-process) |
| `services/capability-runtime` | Capability adapters (gateway in-process) |
| `packages/icons` | Shared icon components (`IconifyIcon`, model resolvers) |
| `packages/sdk` | Typed HTTP/Socket client |
| `packages/types` | Shared DTOs (`ModelInfo`, chat types) |
| `catalog/` | Providers, capabilities, tools, policy YAML |
| `packages/catalog-codegen` | Codegen from `catalog/` |
| `planner-config/` | Planner prompts + `ai-models.yaml` |
| `connectors/` | Integration playbooks synced to `packages/connectors` |

## AI runtime modules

See [services/ai-runtime/README.md](../services/ai-runtime/README.md) for `agent/` vs `agents/`, voice folders, and dev commands.

## Generated artifacts

`pnpm catalog:generate` writes:

- `packages/capabilities/generated/capability-manifest.json` (TypeScript consumers)
- `services/ai-runtime/capability_manifest.json` (Python consumers)

Both are generated from the same catalog source; do not edit by hand.
