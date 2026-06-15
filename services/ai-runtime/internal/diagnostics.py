from __future__ import annotations

import asyncio
import logging
import time

from models.model_resolver import litellm_kwargs, model_is_available, provider_for_model
from models.streaming.litellm_stream import iter_litellm_tokens
from llm.provider_monitor import health_metrics

logger = logging.getLogger(__name__)

_PROBE_MODELS = (
    ("groq/llama-3.1-8b", "fast_chat"),
    ("nvidia/nemotron-mini-4b-instruct", "fast_chat"),
)

_PROBE_MESSAGES = [{"role": "user", "content": "Reply with exactly: ok"}]


async def probe_providers_once() -> None:
    for model_id, task in _PROBE_MODELS:
        if not model_is_available(model_id):
            continue
        prov = provider_for_model(model_id)
        t0 = time.perf_counter()
        try:
            kwargs = litellm_kwargs(model_id, stream=True, task=task, allow_thinking=False)
            kwargs["max_tokens"] = 4
            got = False
            async for token in iter_litellm_tokens(_PROBE_MESSAGES, kwargs):
                if token:
                    got = True
                    break
            latency_ms = (time.perf_counter() - t0) * 1000
            health_metrics.record(
                prov, success=got, latency_ms=latency_ms, task=task
            )
            logger.info(
                "[health-probe] provider=%s model=%s ok=%s latency_ms=%.0f",
                prov,
                model_id,
                got,
                latency_ms,
            )
        except Exception as exc:
            health_metrics.record(
                prov, success=False, latency_ms=(time.perf_counter() - t0) * 1000, task=task
            )
            logger.warning("[health-probe] provider=%s failed: %s", prov, exc)


async def run_provider_probe_loop(interval_s: float = 300.0) -> None:
    while True:
        try:
            await probe_providers_once()
        except Exception as exc:
            logger.warning("[health-probe] loop error: %s", exc)
        await asyncio.sleep(interval_s)
