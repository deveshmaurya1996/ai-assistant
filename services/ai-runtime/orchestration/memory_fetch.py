from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


async def fetch_hybrid_memory_block(
    *,
    query: str,
    user_id: str,
    skip_episodic: bool,
    timings: Dict[str, float],
    chat_session_id: Optional[str] = None,
    memory_budget_ms: Optional[float] = None,
) -> tuple[str, bool]:
    """Wait up to budget for memory; return (block, status_emitted)."""
    from context.context_builder import fetch_layered_memory_context
    from orchestration.turn_router import memory_prestream_budget_ms

    budget_ms = (
        float(memory_budget_ms)
        if memory_budget_ms is not None
        else memory_prestream_budget_ms()
    )
    budget_s = budget_ms / 1000.0
    t0 = time.perf_counter()
    task = asyncio.create_task(
        fetch_layered_memory_context(
            query,
            user_id,
            skip_episodic=skip_episodic,
            chat_session_id=chat_session_id,
        )
    )
    status_emitted = False
    try:
        block = await asyncio.wait_for(asyncio.shield(task), timeout=budget_s)
        timings["rag_ms"] = (time.perf_counter() - t0) * 1000
        timings["rag_within_budget"] = 1.0
        return block, status_emitted
    except asyncio.TimeoutError:
        status_emitted = True
        timings["rag_within_budget"] = 0.0
        try:
            block = await task
            timings["rag_ms"] = (time.perf_counter() - t0) * 1000
            return block, status_emitted
        except Exception as exc:
            logger.warning("[agent] memory fetch failed after status: %s", exc)
            timings["rag_ms"] = (time.perf_counter() - t0) * 1000
            return "", status_emitted
