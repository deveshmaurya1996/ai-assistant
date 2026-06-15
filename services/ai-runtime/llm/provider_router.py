from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from models.config_loader import (
    get_orchestration_config,
    load_ai_models_config,
    routing_tiers_for_task,
)
from models.model_resolver import (
    label_for,
    litellm_kwargs,
    model_is_available,
    provider_for_model,
)
from llm.provider_monitor import circuit_breaker, health_metrics
from llm import model_health, ranking
from llm.stream_race import iter_tier_race_tokens, stream_winner
from models.providers.nvidia_vlm import is_nvidia_vlm_model
from models.streaming.sse import sse_done, sse_provider_switch, sse_token

logger = logging.getLogger(__name__)


def provider_config(provider: str) -> Dict[str, Any]:
    cfg = load_ai_models_config()
    return dict((cfg.get("providers") or {}).get(provider) or {})


def list_chat_providers() -> List[str]:
    cfg = load_ai_models_config()
    names: List[str] = []
    for name, prov in (cfg.get("providers") or {}).items():
        kind = str(prov.get("kind", ""))
        if kind in ("openai_compatible", "groq", "pollinations"):
            names.append(str(name))
    return names


def orchestration_settings() -> Dict[str, Any]:
    return get_orchestration_config()


def tiers_for_task(task: str) -> Dict[str, List[str]]:
    return routing_tiers_for_task(task)


def _expected_primary(tier1: List[str]) -> Optional[str]:
    filtered = [m for m in tier1 if model_is_available(m)]
    return filtered[0] if filtered else None


def _remaining_ms(deadline_t0: float, deadline_ms: Optional[float]) -> Optional[float]:
    if deadline_ms is None:
        return None
    return deadline_ms - (time.perf_counter() - deadline_t0) * 1000


def _budget_exhausted(deadline_t0: float, deadline_ms: Optional[float]) -> bool:
    remaining = _remaining_ms(deadline_t0, deadline_ms)
    return remaining is not None and remaining <= 0


def _use_model_health_v2() -> bool:
    return os.getenv("MODEL_HEALTH_V2", "true").lower() not in ("0", "false", "no")


async def stream_text_orchestrated(
    messages: List[Dict[str, Any]],
    task: str,
    *,
    allow_thinking: Optional[bool] = None,
    speed_profile: Optional[str] = None,
    deadline_ms: Optional[float] = None,
    cancel_event: Optional[asyncio.Event] = None,
    preferred_model_id: Optional[str] = None,
    session_model_id: Optional[str] = None,
) -> AsyncIterator[str]:
    if _use_model_health_v2():
        tiers = await ranking.effective_tiers_for_task(
            task,
            preferred_model_id=preferred_model_id,
            session_model_id=session_model_id,
        )
    else:
        tiers = tiers_for_task(task)
    primary_expected = _expected_primary(tiers.get("tier1") or [])
    t0 = time.perf_counter()
    last_error: Optional[Exception] = None
    orchestration_meta: Dict[str, Any] = {
        "task": task,
        "tier": None,
        "provider_switch": False,
        "ttft_ms": None,
    }

    for tier_name in ("tier1", "tier2"):
        if cancel_event and cancel_event.is_set():
            raise asyncio.CancelledError()
        if _budget_exhausted(t0, deadline_ms):
            logger.warning("[orchestrator] deadline exhausted before %s task=%s", tier_name, task)
            break

        tier_models = tiers.get(tier_name) or []
        winner: Optional[str] = None
        first_token = True

        tier_race_meta: Dict[str, Any] = {}
        try:
            async for model_id, token in iter_tier_race_tokens(
                tier_models,
                messages,
                task=task,
                allow_thinking=allow_thinking,
                speed_profile=speed_profile,
                cancel_event=cancel_event,
                race_meta=tier_race_meta,
                session_model_id=session_model_id or preferred_model_id,
            ):
                if winner is None:
                    winner = model_id
                    orchestration_meta["tier"] = tier_name
                    orchestration_meta["race_mode"] = tier_race_meta.get("race_mode")
                    orchestration_meta["ttft_ms"] = round((time.perf_counter() - t0) * 1000, 1)
                    if primary_expected and winner != primary_expected:
                        orchestration_meta["provider_switch"] = True
                        yield sse_provider_switch(
                            provider_for_model(primary_expected),
                            provider_for_model(winner),
                            primary_expected,
                            winner,
                        )
                    logger.info(
                        "[orchestrator] stream task=%s model=%s ttft_ms=%.0f tier=%s",
                        task,
                        winner,
                        orchestration_meta["ttft_ms"],
                        tier_name,
                    )

                if first_token:
                    first_token = False
                yield sse_token(token)

            if winner and not first_token:
                yield sse_done(winner, label_for(winner), meta=orchestration_meta)
                return
            if winner and first_token:
                raise RuntimeError(f"No tokens from {winner}")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            last_error = exc
            if winner:
                prov = provider_for_model(winner)
                circuit_breaker.record_failure(prov, task=task)
                health_metrics.record(prov, success=False, latency_ms=0, task=task)
                if _use_model_health_v2():
                    await model_health.record_request(
                        winner, task=task, latency_ms=0, success=False
                    )
            logger.warning(
                "[orchestrator] tier %s failed task=%s: %s",
                tier_name,
                task,
                exc,
            )

    for model_id in tiers.get("tier3") or []:
        if cancel_event and cancel_event.is_set():
            raise asyncio.CancelledError()
        if _budget_exhausted(t0, deadline_ms):
            break
        if not model_is_available(model_id):
            continue
        if _use_model_health_v2():
            if not await model_health.is_available(
                model_id,
                session_model_id=session_model_id or preferred_model_id,
                allow_degraded=True,
            ):
                continue
        prov = provider_for_model(model_id)
        if not _use_model_health_v2() and circuit_breaker.is_open(prov, task=task):
            continue
        if is_nvidia_vlm_model(model_id):
            continue
        t_attempt = time.perf_counter()
        try:
            if primary_expected and model_id != primary_expected:
                orchestration_meta["provider_switch"] = True
                yield sse_provider_switch(
                    provider_for_model(primary_expected),
                    prov,
                    primary_expected,
                    model_id,
                )
            got_token = False
            async for token in stream_winner(
                model_id,
                messages,
                task=task,
                allow_thinking=allow_thinking,
                speed_profile=speed_profile,
                cancel_event=cancel_event,
            ):
                if not got_token:
                    orchestration_meta["tier"] = "tier3"
                    orchestration_meta["ttft_ms"] = round(
                        (time.perf_counter() - t0) * 1000, 1
                    )
                    got_token = True
                yield sse_token(token)
            if not got_token:
                raise RuntimeError(f"No tokens from {model_id}")
            latency_ms = (time.perf_counter() - t_attempt) * 1000
            circuit_breaker.record_success(prov, task=task)
            health_metrics.record(prov, success=True, latency_ms=latency_ms, task=task)
            if _use_model_health_v2():
                await model_health.record_request(
                    model_id, task=task, latency_ms=latency_ms, success=True
                )
            yield sse_done(model_id, label_for(model_id), meta=orchestration_meta)
            return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            last_error = exc
            circuit_breaker.record_failure(prov, task=task)
            health_metrics.record(
                prov,
                success=False,
                latency_ms=(time.perf_counter() - t_attempt) * 1000,
                task=task,
            )
            if _use_model_health_v2():
                await model_health.record_request(
                    model_id,
                    task=task,
                    latency_ms=(time.perf_counter() - t_attempt) * 1000,
                    success=False,
                )
            logger.warning("[orchestrator] tier3 failed model=%s: %s", model_id, exc)

    raise RuntimeError(f"All models failed: {last_error}")


async def complete_text_orchestrated(
    messages: List[Dict[str, Any]],
    task: str,
    *,
    allow_thinking: Optional[bool] = None,
    cancel_event: Optional[asyncio.Event] = None,
    preferred_model_id: Optional[str] = None,
    session_model_id: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    import litellm

    litellm.suppress_debug_info = True
    if _use_model_health_v2():
        tiers = await ranking.effective_tiers_for_task(
            task,
            preferred_model_id=preferred_model_id,
            session_model_id=session_model_id,
        )
    else:
        tiers = tiers_for_task(task)
    last_error: Optional[Exception] = None

    async def complete_one(model_id: str) -> str:
        call_kwargs = litellm_kwargs(
            model_id, stream=False, task=task, allow_thinking=allow_thinking
        )
        timeout_s = float(call_kwargs.get("timeout", 20)) + 2.0
        resp = await asyncio.wait_for(
            litellm.acompletion(messages=messages, stream=False, **call_kwargs),
            timeout=timeout_s,
        )
        return str(
            resp.get("choices", [{}])[0].get("message", {}).get("content", "")
        ).strip()

    for tier_name in ("tier1", "tier2"):
        tier_models = []
        for m in tiers.get(tier_name) or []:
            if not model_is_available(m):
                continue
            if _use_model_health_v2():
                if not await model_health.is_available(
                    m,
                    session_model_id=session_model_id or preferred_model_id,
                    allow_degraded=True,
                ):
                    continue
            elif circuit_breaker.is_open(provider_for_model(m), task=task):
                continue
            tier_models.append(m)
        if not tier_models:
            continue
        ranked = health_metrics.sort_models_by_latency(
            tier_models, provider_for_model, task=task
        )[:2]
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
                    circuit_breaker.record_success(prov, task=task)
                    if _use_model_health_v2():
                        await model_health.record_request(
                            model_id, task=task, latency_ms=0, success=True
                        )
                    return t.result(), model_id
                last_error = exc
        except Exception as exc:
            last_error = exc

    for model_id in tiers.get("tier3") or []:
        if not model_is_available(model_id) or is_nvidia_vlm_model(model_id):
            continue
        prov = provider_for_model(model_id)
        if _use_model_health_v2():
            if not await model_health.is_available(
                model_id,
                session_model_id=session_model_id or preferred_model_id,
                allow_degraded=True,
            ):
                continue
        elif circuit_breaker.is_open(prov, task=task):
            continue
        try:
            text = await complete_one(model_id)
            circuit_breaker.record_success(prov, task=task)
            if _use_model_health_v2():
                await model_health.record_request(
                    model_id, task=task, latency_ms=0, success=True
                )
            return text, model_id
        except Exception as exc:
            last_error = exc
            circuit_breaker.record_failure(prov, task=task)
            if _use_model_health_v2():
                await model_health.record_request(
                    model_id, task=task, latency_ms=0, success=False
                )

    return f"All models failed: {last_error}", None
