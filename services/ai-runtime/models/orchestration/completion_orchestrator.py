from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from models.model_resolver import (
    label_for,
    litellm_kwargs,
    model_is_available,
    provider_for_model,
)
from models.orchestration.circuit_breaker import circuit_breaker
from models.orchestration.health_metrics import health_metrics
from models.orchestration.provider_registry import tiers_for_task
from models.orchestration.stream_race import race_tier, stream_winner
from models.providers.nvidia_vlm import is_nvidia_vlm_model
from models.streaming.sse import sse_done, sse_provider_switch, sse_token

logger = logging.getLogger(__name__)


def _expected_primary(tier1: List[str]) -> Optional[str]:
    filtered = [m for m in tier1 if model_is_available(m)]
    return filtered[0] if filtered else None


async def stream_text_orchestrated(
    messages: List[Dict[str, Any]],
    task: str,
    *,
    cancel_event: Optional[asyncio.Event] = None,
) -> AsyncIterator[str]:
    tiers = tiers_for_task(task)
    primary_expected = _expected_primary(tiers.get("tier1") or [])
    t0 = time.perf_counter()
    last_error: Optional[Exception] = None

    for tier_name in ("tier1", "tier2"):
        if cancel_event and cancel_event.is_set():
            raise asyncio.CancelledError()
        tier_models = tiers.get(tier_name) or []
        result = await race_tier(tier_models, messages, cancel_event=cancel_event)
        if not result:
            continue
        winner, latency_ms = result
        if primary_expected and winner != primary_expected:
            yield sse_provider_switch(
                provider_for_model(primary_expected),
                provider_for_model(winner),
                primary_expected,
                winner,
            )
        first_token = True
        try:
            async for token in stream_winner(winner, messages, cancel_event=cancel_event):
                if first_token:
                    logger.info(
                        "[orchestrator] stream task=%s model=%s ttft_ms=%.0f tier=%s",
                        task,
                        winner,
                        (time.perf_counter() - t0) * 1000,
                        tier_name,
                    )
                    first_token = False
                yield sse_token(token)
            if first_token:
                raise RuntimeError(f"No tokens from {winner}")
            yield sse_done(winner, label_for(winner))
            return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            last_error = exc
            prov = provider_for_model(winner)
            circuit_breaker.record_failure(prov)
            health_metrics.record(prov, success=False, latency_ms=latency_ms)
            logger.warning(
                "[orchestrator] winner stream failed model=%s: %s",
                winner,
                exc,
            )

    for model_id in tiers.get("tier3") or []:
        if cancel_event and cancel_event.is_set():
            raise asyncio.CancelledError()
        if not model_is_available(model_id):
            continue
        prov = provider_for_model(model_id)
        if circuit_breaker.is_open(prov):
            continue
        if is_nvidia_vlm_model(model_id):
            continue
        t_attempt = time.perf_counter()
        try:
            if primary_expected and model_id != primary_expected:
                yield sse_provider_switch(
                    provider_for_model(primary_expected),
                    prov,
                    primary_expected,
                    model_id,
                )
            got_token = False
            async for token in stream_winner(model_id, messages, cancel_event=cancel_event):
                got_token = True
                yield sse_token(token)
            if not got_token:
                raise RuntimeError(f"No tokens from {model_id}")
            latency_ms = (time.perf_counter() - t_attempt) * 1000
            circuit_breaker.record_success(prov)
            health_metrics.record(prov, success=True, latency_ms=latency_ms)
            yield sse_done(model_id, label_for(model_id))
            return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            last_error = exc
            circuit_breaker.record_failure(prov)
            health_metrics.record(
                prov,
                success=False,
                latency_ms=(time.perf_counter() - t_attempt) * 1000,
            )
            logger.warning("[orchestrator] tier3 failed model=%s: %s", model_id, exc)

    raise RuntimeError(f"All models failed: {last_error}")


async def complete_text_orchestrated(
    messages: List[Dict[str, Any]],
    task: str,
    *,
    cancel_event: Optional[asyncio.Event] = None,
) -> Tuple[str, Optional[str]]:
    import litellm

    litellm.suppress_debug_info = True
    tiers = tiers_for_task(task)
    last_error: Optional[Exception] = None

    async def complete_one(model_id: str) -> str:
        call_kwargs = litellm_kwargs(model_id, stream=False)
        timeout_s = float(call_kwargs.get("timeout", 20)) + 2.0
        resp = await asyncio.wait_for(
            litellm.acompletion(messages=messages, stream=False, **call_kwargs),
            timeout=timeout_s,
        )
        return str(
            resp.get("choices", [{}])[0].get("message", {}).get("content", "")
        ).strip()

    for tier_name in ("tier1", "tier2"):
        tier_models = [
            m
            for m in (tiers.get(tier_name) or [])
            if model_is_available(m) and not circuit_breaker.is_open(provider_for_model(m))
        ]
        if not tier_models:
            continue
        ranked = health_metrics.sort_models_by_latency(tier_models, provider_for_model)[:2]
        task_map = {asyncio.create_task(complete_one(m)): m for m in ranked}
        try:
            done, pending = await asyncio.wait(
                task_map.keys(), return_when=asyncio.FIRST_COMPLETED
            )
            for t in pending:
                t.cancel()
            for t in done:
                exc = t.exception()
                if exc is None:
                    model_id = task_map[t]
                    prov = provider_for_model(model_id)
                    circuit_breaker.record_success(prov)
                    return t.result(), model_id
                last_error = exc
        except Exception as exc:
            last_error = exc

    for model_id in tiers.get("tier3") or []:
        if not model_is_available(model_id) or is_nvidia_vlm_model(model_id):
            continue
        prov = provider_for_model(model_id)
        if circuit_breaker.is_open(prov):
            continue
        try:
            text = await complete_one(model_id)
            circuit_breaker.record_success(prov)
            return text, model_id
        except Exception as exc:
            last_error = exc
            circuit_breaker.record_failure(prov)

    return f"All models failed: {last_error}", None
