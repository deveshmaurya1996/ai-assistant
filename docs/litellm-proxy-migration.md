# LiteLLM Proxy Migration Criteria

This project uses a **hybrid** approach: a custom orchestrator in `services/ai-runtime` with patterns borrowed from LiteLLM Router / production LLM gateways. Full LiteLLM Proxy migration is optional and should be triggered only when the criteria below are met.

## Stay on custom orchestrator when

- Single Render web service (gateway + ai-runtime in one container)
- Model count is manageable via `planner-config/ai-models.yaml`
- Tier racing and circuit breakers meet SLOs after Phase 1–4 hardening
- Team prefers cognitive + ai-runtime separation without an extra proxy hop

## Evaluate LiteLLM Proxy when

1. **Multiple intelligence instances** need shared rate-limit / cooldown state (Redis-backed Router)
2. **Model catalog** grows beyond manual YAML maintenance (100+ deployments)
3. **Unified billing / observability UI** is required across providers
4. **Cross-provider failover** complexity exceeds what `stream_race.py` + `completion_orchestrator.py` should own

## Migration path (non-breaking)

1. Run LiteLLM Proxy as a **sidecar** or replace internal `litellm.acompletion` calls with Router HTTP
2. Map `routingTiers` in `ai-models.yaml` to LiteLLM `model_list` + `fallbacks`
3. Keep **cognitive-runtime** and **gateway** unchanged — only ai-runtime model layer swaps
4. Enable Redis for cooldowns if running >1 replica

## Spike checklist

- [ ] Export current tier config to LiteLLM `config.yaml`
- [ ] Benchmark TTFT: custom race vs LiteLLM `simple-shuffle` on `fast_chat`
- [ ] Verify streaming failover before-first-chunk matches current SSE contract
- [ ] Load-test 429 cooldown behavior with shared Redis

## References

- [LiteLLM Router docs](https://docs.litellm.ai/docs/routing)
- [LLM gateway case study](https://hld.handbook.academy/curriculum/case-studies/model-router-gateway/)
