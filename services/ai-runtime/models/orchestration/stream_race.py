from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, AsyncIterator, Dict, List, Optional

from models.config_loader import get_orchestration_config
from models.model_resolver import (
    label_for,
    litellm_kwargs,
    model_is_available,
    provider_for_model,
)
from models.orchestration.circuit_breaker import circuit_breaker
from models.orchestration.health_metrics import health_metrics
from models.streaming.litellm_stream import iter_litellm_tokens

logger = logging.getLogger(__name__)


def _filter_models(model_ids: List[str]) -> List[str]:
    out: List[str] = []
    for mid in model_ids:
        if not model_is_available(mid):
            continue
        prov = provider_for_model(mid)
        if circuit_breaker.is_open(prov):
            continue
        out.append(mid)
    return out


def _rank_models(model_ids: List[str]) -> List[str]:
    cfg = get_orchestration_config()
    ranked = health_metrics.sort_models_by_latency(model_ids, provider_for_model)
    return ranked[: cfg["maxConcurrentPerTier"]]


async def _probe_first_token(
    model_id: str,
    messages: List[Dict[str, Any]],
    *,
    cancel_event: Optional[asyncio.Event],
) -> tuple[str, float]:
    if cancel_event and cancel_event.is_set():
        raise asyncio.CancelledError()
    t0 = time.perf_counter()
    call_kwargs = litellm_kwargs(model_id, stream=True)
    timeout_s = float(call_kwargs.get("timeout", 8))
    connect_timeout = min(timeout_s, 8.0)

    async def _run() -> str:
        async for token in iter_litellm_tokens(messages, call_kwargs):
            if token:
                return model_id
        raise TimeoutError(f"No tokens from {model_id}")

    return (
        await asyncio.wait_for(_run(), timeout=connect_timeout),
        (time.perf_counter() - t0) * 1000,
    )


async def race_tier(
    model_ids: List[str],
    messages: List[Dict[str, Any]],
    *,
    cancel_event: Optional[asyncio.Event] = None,
) -> Optional[tuple[str, float]]:
    candidates = _rank_models(_filter_models(model_ids))
    if not candidates:
        return None
    if len(candidates) == 1:
        mid = candidates[0]
        try:
            _, latency = await _probe_first_token(mid, messages, cancel_event=cancel_event)
            return mid, latency
        except (asyncio.CancelledError, Exception) as exc:
            prov = provider_for_model(mid)
            circuit_breaker.record_failure(prov)
            health_metrics.record(prov, success=False, latency_ms=0)
            logger.warning("[orchestrator] tier probe failed model=%s: %s", mid, exc)
            return None

    tasks: List[asyncio.Task] = []
    try:
        for mid in candidates:
            tasks.append(
                asyncio.create_task(
                    _probe_first_token(mid, messages, cancel_event=cancel_event),
                    name=f"probe:{mid}",
                )
            )
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        if cancel_event and cancel_event.is_set():
            for t in pending:
                t.cancel()
            raise asyncio.CancelledError()

        winner: Optional[tuple[str, float]] = None
        for t in done:
            if t.cancelled():
                continue
            exc = t.exception()
            if exc is not None:
                continue
            model_id, latency_ms = t.result()
            winner = (model_id, latency_ms)
            break

        for t in pending:
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass

        if winner:
            mid, latency_ms = winner
            prov = provider_for_model(mid)
            circuit_breaker.record_success(prov)
            health_metrics.record(prov, success=True, latency_ms=latency_ms)
            for t in done:
                if t.done() and not t.cancelled() and t.exception() is None:
                    other_mid, _ = t.result()
                    if other_mid != mid:
                        other_prov = provider_for_model(other_mid)
                        health_metrics.record(other_prov, success=False, latency_ms=latency_ms)
            logger.info(
                "[orchestrator] tier race winner=%s latency_ms=%.0f",
                mid,
                latency_ms,
            )
            return winner

        for t in done:
            if t.cancelled():
                continue
            exc = t.exception()
            if exc is not None:
                mid_name = (t.get_name() or "").replace("probe:", "")
                if mid_name:
                    prov = provider_for_model(mid_name)
                    circuit_breaker.record_failure(prov)
                    health_metrics.record(prov, success=False, latency_ms=0)
        return None
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()


async def stream_winner(
    model_id: str,
    messages: List[Dict[str, Any]],
    *,
    cancel_event: Optional[asyncio.Event] = None,
) -> AsyncIterator[str]:
    call_kwargs = litellm_kwargs(model_id, stream=True)
    async for token in iter_litellm_tokens(messages, call_kwargs):
        if cancel_event and cancel_event.is_set():
            raise asyncio.CancelledError()
        if token:
            yield token
