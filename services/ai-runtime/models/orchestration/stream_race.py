from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, AsyncIterator, Dict, List, Optional

from models.config_loader import get_orchestration_config, probe_timeout_for_task
from models.model_resolver import (
    litellm_kwargs,
    model_is_available,
    provider_for_model,
)
from models.orchestration.circuit_breaker import circuit_breaker
from models.orchestration.health_metrics import health_metrics
from models.streaming.litellm_stream import iter_litellm_tokens

logger = logging.getLogger(__name__)

_STREAM_END = object()


def _filter_models(model_ids: List[str], *, task: str) -> List[str]:
    out: List[str] = []
    for mid in model_ids:
        if not model_is_available(mid):
            continue
        prov = provider_for_model(mid)
        if circuit_breaker.is_open(prov, task=task):
            continue
        out.append(mid)
    return out


def _adaptive_candidates(
    model_ids: List[str], *, task: str, race_meta: Optional[Dict[str, Any]] = None
) -> List[str]:
    cfg = get_orchestration_config()
    ranked = health_metrics.sort_models_by_latency(model_ids, provider_for_model, task=task)
    if not ranked:
        if race_meta is not None:
            race_meta["race_mode"] = "none"
        return []

    primary = ranked[0]
    race_mode = "primary"
    candidates = [primary]

    if cfg.get("adaptiveEnabled", True):
        prov = provider_for_model(primary)
        if health_metrics.should_race_primary(
            prov,
            task=task,
            threshold=float(cfg.get("raceHealthThreshold", 0.9)),
            min_samples=int(cfg.get("raceMinSamples", 5)),
        ):
            candidates = ranked[: cfg["maxConcurrentPerTier"]]
            race_mode = "hedged"

    if race_meta is not None:
        race_meta["race_mode"] = race_mode
        race_meta["race_candidates"] = list(candidates)
    return candidates


async def _pump_model_tokens(
    model_id: str,
    messages: List[Dict[str, Any]],
    *,
    task: str,
    allow_thinking: Optional[bool],
    speed_profile: Optional[str],
    queue: asyncio.Queue,
    loser_event: asyncio.Event,
    cancel_event: Optional[asyncio.Event],
) -> None:
    try:
        call_kwargs = litellm_kwargs(
            model_id,
            stream=True,
            task=task,
            allow_thinking=allow_thinking,
            speed_profile=speed_profile,
        )
        async for token in iter_litellm_tokens(messages, call_kwargs):
            if cancel_event and cancel_event.is_set():
                return
            if loser_event.is_set():
                return
            if token:
                await queue.put(token)
        await queue.put(_STREAM_END)
    except Exception as exc:
        await queue.put(exc)


async def iter_tier_race_tokens(
    model_ids: List[str],
    messages: List[Dict[str, Any]],
    *,
    task: str,
    allow_thinking: Optional[bool] = None,
    speed_profile: Optional[str] = None,
    probe_timeout_s: Optional[float] = None,
    cancel_event: Optional[asyncio.Event] = None,
    race_meta: Optional[Dict[str, Any]] = None,
) -> AsyncIterator[tuple[str, str]]:
    """Hedged tier race: one stream per candidate; yield tokens from first winner only."""
    if cancel_event and cancel_event.is_set():
        raise asyncio.CancelledError()

    candidates = _adaptive_candidates(
        _filter_models(model_ids, task=task), task=task, race_meta=race_meta
    )
    if not candidates:
        return

    if len(candidates) == 1:
        mid = candidates[0]
        async for token in stream_winner(
            mid,
            messages,
            task=task,
            allow_thinking=allow_thinking,
            speed_profile=speed_profile,
            cancel_event=cancel_event,
        ):
            yield mid, token
        return

    timeout_s = probe_timeout_s if probe_timeout_s is not None else probe_timeout_for_task(task)
    loser_event = asyncio.Event()
    queues: Dict[str, asyncio.Queue] = {mid: asyncio.Queue() for mid in candidates}
    pump_tasks = [
        asyncio.create_task(
            _pump_model_tokens(
                mid,
                messages,
                task=task,
                allow_thinking=allow_thinking,
                speed_profile=speed_profile,
                queue=queues[mid],
                loser_event=loser_event,
                cancel_event=cancel_event,
            ),
            name=f"pump:{mid}",
        )
        for mid in candidates
    ]

    winner: Optional[str] = None
    t0 = time.perf_counter()
    pending: Dict[asyncio.Task, str] = {
        asyncio.create_task(queues[mid].get()): mid for mid in candidates
    }

    try:
        while pending:
            if cancel_event and cancel_event.is_set():
                raise asyncio.CancelledError()

            wait_timeout = timeout_s if winner is None else None
            done, _ = await asyncio.wait(
                pending.keys(),
                return_when=asyncio.FIRST_COMPLETED,
                timeout=wait_timeout,
            )

            if not done:
                break

            for finished in list(done):
                mid = pending.pop(finished)
                item = finished.result()

                if isinstance(item, Exception):
                    prov = provider_for_model(mid)
                    circuit_breaker.record_failure(prov, task=task)
                    health_metrics.record(prov, success=False, latency_ms=0, task=task)
                    logger.warning("[orchestrator] pump failed model=%s: %s", mid, item)
                    continue

                if item is _STREAM_END:
                    continue

                token = str(item)
                if winner is None:
                    winner = mid
                    latency_ms = (time.perf_counter() - t0) * 1000
                    loser_event.set()
                    prov = provider_for_model(mid)
                    circuit_breaker.record_success(prov, task=task)
                    health_metrics.record(prov, success=True, latency_ms=latency_ms, task=task)
                    for other_mid in candidates:
                        if other_mid != mid:
                            health_metrics.record(
                                provider_for_model(other_mid),
                                success=False,
                                latency_ms=latency_ms,
                                task=task,
                            )
                    logger.info(
                        "[orchestrator] tier race winner=%s latency_ms=%.0f task=%s",
                        mid,
                        latency_ms,
                        task,
                    )
                    for other_task in list(pending.keys()):
                        other_task.cancel()
                        pending.pop(other_task, None)
                    yield winner, token
                    pending[asyncio.create_task(queues[winner].get())] = winner
                elif mid == winner:
                    yield winner, token
                    pending[asyncio.create_task(queues[winner].get())] = winner

        if winner:
            while True:
                if cancel_event and cancel_event.is_set():
                    raise asyncio.CancelledError()
                item = await queues[winner].get()
                if item is _STREAM_END:
                    break
                if isinstance(item, Exception):
                    raise item
                yield winner, str(item)
    finally:
        loser_event.set()
        for t in pump_tasks:
            if not t.done():
                t.cancel()
        for t in pump_tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        for t in list(pending.keys()):
            t.cancel()


async def race_tier(
    model_ids: List[str],
    messages: List[Dict[str, Any]],
    *,
    task: str,
    allow_thinking: Optional[bool] = None,
    probe_timeout_s: Optional[float] = None,
    cancel_event: Optional[asyncio.Event] = None,
) -> Optional[tuple[str, float]]:
    """Return (winner_model_id, latency_ms) after first token."""
    t0 = time.perf_counter()
    try:
        async for _mid, _token in iter_tier_race_tokens(
            model_ids,
            messages,
            task=task,
            allow_thinking=allow_thinking,
            probe_timeout_s=probe_timeout_s,
            cancel_event=cancel_event,
        ):
            return _mid, (time.perf_counter() - t0) * 1000
    except asyncio.CancelledError:
        return None
    return None


async def stream_winner(
    model_id: str,
    messages: List[Dict[str, Any]],
    *,
    task: str,
    allow_thinking: Optional[bool] = None,
    speed_profile: Optional[str] = None,
    cancel_event: Optional[asyncio.Event] = None,
) -> AsyncIterator[str]:
    call_kwargs = litellm_kwargs(
        model_id,
        stream=True,
        task=task,
        allow_thinking=allow_thinking,
        speed_profile=speed_profile,
    )
    async for token in iter_litellm_tokens(messages, call_kwargs):
        if cancel_event and cancel_event.is_set():
            raise asyncio.CancelledError()
        if token:
            yield token
