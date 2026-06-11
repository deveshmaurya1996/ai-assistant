# Integration catalog (single source of truth)

Human-edited YAML in this folder drives generated registries across the monorepo.

| File | Purpose |
|------|---------|
| `providers.yaml` | Connect Apps providers (google, whatsapp, platform) |
| `capabilities.yaml` | Planner capability IDs + provider bindings |
| `tools.yaml` | Execution tool metadata (names, risk, connector) |
| `policy.yaml` | Blocked tools, dangerous chains, permission overrides |

## Add a new tool

1. Add entry to `tools.yaml` (name, providerId, dangerous, supportsCancellation).
2. If planner-visible, add capability to `capabilities.yaml` with `bindings[].tool`.
3. Add Zod parameters in `packages/tool-schema/src/tool-schemas.ts` under `TOOL_PARAMETER_SCHEMAS`.
4. Implement runtime handler in `packages/integration-runtime/` or `services/tool-runtime/src/platform-tools.ts`.
5. Optional: add `connectors/<app>/PLAYBOOK.md` for planner context.
6. Run `pnpm catalog:generate && pnpm build`.

## Generate / validate

```bash
pnpm catalog:generate   # emit TS/SQL/JSON artifacts
pnpm catalog:validate   # cross-check catalog vs capabilities/tools
```

Do not edit generated files under `packages/*/src/generated/`.
