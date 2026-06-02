# AI Assistant OS — Evolution Roadmap

Living document for the transition from **tool-centric chat backend** to **AI Agent Operating System**.

See also: [CORE_AI_README.md](./CORE_AI_README.md) for current implementation details.

## Architecture target

```
Clients → Gateway → Cognitive Runtime → Skill Runtime → Tool Runtime → Connectors
                ↘ AI Runtime (models/RAG/voice)
                ↘ Event Bus → Workflows (Temporal)
```

## Layer map (current)

| Target | Path | Status |
|--------|------|--------|
| Gateway | `services/gateway` | Renamed from `api`; `@ai-assistant/api` shim |
| AI Runtime | `services/ai-runtime` | Renamed from `ai` |
| Cognitive Runtime | `services/cognitive-runtime` | Renamed from `ai-orchestrator` |
| Skill Runtime | `services/skill-runtime` | New — capabilities + SKILL.md |
| Tool Runtime | `services/tool-runtime` | Unchanged execution engine |
| Capabilities | `packages/capabilities` | Registry + legacy tool mapping |
| Skills | `skills/*` + `packages/skills` | SKILL.md loader |
| Event Bus | `services/event-bus` | Redis tap + recent events API |
| Workflow Engine | `services/workflow-engine` | Temporal stub |
| World State | `services/world-state` | Stub |
| Policy Engine | `services/policy-engine` | Wraps permissions |
| Browser Runtime | `services/browser-runtime` | Playwright stub |
| Reflection Engine | `services/reflection-engine` | Stub |

## Capability model

Capabilities replace raw tool names in planning:

```
communication.email.send  →  gmail.send
communication.message.send  →  whatsapp.send_message
productivity.note.create  →  notes.create
```

Planner (`services/cognitive-runtime/orchestration/planner.py`) loads SKILL manuals from skill-runtime and plans `{ capabilities: [...] }`.

## Phases

| Phase | Focus | Status |
|-------|--------|--------|
| 0 | Scaffold + renames | Done |
| 1 | Capabilities + skill runtime + planner | Done |
| 2 | Event catalog expansion + event-bus | Done (Redis; NATS adapter stub) |
| 3 | Temporal workflow-engine | Stub |
| 4–6 | World-state, multi-agent, policy | Stubs / partial |
| 7–10 | Memory 2.0, workspace FS, browser, Android | Planned |
| 11–15 | Realtime voice, autonomy, reflection, MCP | Planned |

## Environment

```bash
SKILL_RUNTIME_URL=http://localhost:3014
COGNITIVE_RUNTIME_URL=http://localhost:3013
AI_ORCHESTRATOR_URL=http://localhost:3013   # alias
SKILLS_ROOT=skills
TEMPORAL_ENABLED=false
EVENT_BUS_BACKEND=redis   # or nats (future)
```

## Success criteria (Phase 0–1)

- [x] `skills/gmail/SKILL.md` in planner context via `/v1/skills/catalog`
- [x] Capability registry maps to legacy tools
- [x] `services/gateway` runs; `services/api` shim delegates
- [x] KB search uses `results` in cognitive context builder
- [ ] Full regression: mobile chat + voice + WhatsApp confirm (run `pnpm test:integration` with stack up — see [AI_OS_AUDIT_STATUS.md](./AI_OS_AUDIT_STATUS.md))

## What not to do yet

- Remove tool-runtime
- Break Socket event contracts
- Production NATS/Kafka cutover without adapter tests
- Full Playwright / Temporal until Phase 9 / 3 complete
