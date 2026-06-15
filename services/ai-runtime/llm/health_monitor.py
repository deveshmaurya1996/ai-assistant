from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import List, Optional

from models.config_loader import (
    get_health_monitor_config,
    models_for_probe_tier,
)
from models.model_resolver import litellm_kwargs, model_is_available
from models.streaming.litellm_stream import iter_litellm_tokens
from llm import model_health

logger = logging.getLogger(__name__)

_PROBE_MESSAGES = [{"role": "user", "content": "Reply with OK"}]

_loops_started = False


async def probe_model_once(model_id: str) -> None:
    if not model_is_available(model_id):
        return
    t0 = time.perf_counter()
    try:
        kwargs = litellm_kwargs(model_id, stream=True, task="fast_chat", allow_thinking=False)
        kwargs["max_tokens"] = int(get_health_monitor_config().get("probeMaxTokens", 2))
        got = False
        async for token in iter_litellm_tokens(_PROBE_MESSAGES, kwargs):
            if token:
                got = True
                break
        latency_ms = (time.perf_counter() - t0) * 1000
        await model_health.record_probe(model_id, latency_ms=latency_ms, success=got)
        logger.info(
            "[health-probe] model=%s ok=%s latency_ms=%.0f",
            model_id,
            got,
            latency_ms,
        )
    except Exception as exc:
        latency_ms = (time.perf_counter() - t0) * 1000
        await model_health.record_probe(model_id, latency_ms=latency_ms, success=False)
        logger.warning("[health-probe] model=%s failed: %s", model_id, exc)


async def _probe_tier_batch(tier: str) -> None:
    cfg = get_health_monitor_config()
    concurrency = int(cfg.get("probeConcurrency", 5))
    models = [m for m in models_for_probe_tier(tier) if model_is_available(m)]
    if not models:
        return
    sem = asyncio.Semaphore(concurrency)

    async def run_one(mid: str) -> None:
        async with sem:
            await probe_model_once(mid)

    await asyncio.gather(*(run_one(m) for m in models), return_exceptions=True)


async def _probe_loop(tier: str, interval_s: float) -> None:
    while True:
        try:
            await _probe_tier_batch(tier)
        except Exception as exc:
            logger.warning("[health-probe] tier=%s loop error: %s", tier, exc)
        await asyncio.sleep(interval_s)


async def start_health_monitor_loops() -> None:
    global _loops_started
    if _loops_started:
        return
    enabled = os.getenv("HEALTH_MONITOR_ENABLED", "true").lower() in ("1", "true", "yes")
    if not enabled:
        logger.info("[health-probe] HEALTH_MONITOR_ENABLED=false, skipping loops")
        return
    _loops_started = True
    cfg = get_health_monitor_config()
    tiers = cfg.get("probeTiers") or {}
    critical_iv = float(tiers.get("critical", 300))
    fallback_iv = float(tiers.get("fallback", 900))
    asyncio.create_task(_probe_loop("critical", critical_iv), name="health-probe-critical")
    asyncio.create_task(_probe_loop("fallback", fallback_iv), name="health-probe-fallback")
    logger.info(
        "[health-probe] started loops critical=%ss fallback=%ss",
        critical_iv,
        fallback_iv,
    )


async def run_capability_probe_json(model_id: str) -> bool:
    """Daily JSON mode probe (PR6)."""
    if not model_is_available(model_id):
        return False
    import json

    import litellm

    try:
        kwargs = litellm_kwargs(model_id, stream=False, task="fast_chat", allow_thinking=False)
        kwargs["max_tokens"] = 32
        kwargs["response_format"] = {"type": "json_object"}
        resp = await litellm.acompletion(
            messages=[{"role": "user", "content": 'Return JSON: {"ok": true}'}],
            stream=False,
            **kwargs,
        )
        content = str(resp.get("choices", [{}])[0].get("message", {}).get("content", ""))
        json.loads(content)
        return True
    except Exception:
        return False


async def run_daily_capability_probes(model_ids: Optional[List[str]] = None) -> None:
    from models.config_loader import runtime_router_model_ids

    targets = model_ids or runtime_router_model_ids()
    for mid in targets:
        if not model_is_available(mid):
            continue
        json_ok = await run_capability_probe_json(mid)
        from llm import redis_store

        await redis_store.set_json(
            redis_store.model_caps_key(mid),
            {"jsonMode": json_ok, "probedAt": time.time()},
            ttl_seconds=86400 * 2,
        )
