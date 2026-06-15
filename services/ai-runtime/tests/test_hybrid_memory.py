import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from orchestration.memory_fetch import fetch_hybrid_memory_block


@pytest.mark.asyncio
async def test_hybrid_memory_within_budget_no_status():
    async def fast_fetch(*_a, **_k):
        await asyncio.sleep(0.01)
        return "Retrieved:\n- hit"

    timings: dict = {}
    with patch(
        "context.context_builder.fetch_layered_memory_context",
        side_effect=fast_fetch,
    ):
        block, status = await fetch_hybrid_memory_block(
            query="what did we discuss?",
            user_id="u1",
            skip_episodic=False,
            timings=timings,
        )
    assert "hit" in block
    assert status is False
    assert timings.get("rag_within_budget") == 1.0


@pytest.mark.asyncio
async def test_hybrid_memory_over_budget_emits_status():
    async def slow_fetch(*_a, **_k):
        await asyncio.sleep(0.5)
        return "Retrieved:\n- late hit"

    timings: dict = {}
    with (
        patch(
            "context.context_builder.fetch_layered_memory_context",
            side_effect=slow_fetch,
        ),
        patch(
            "orchestration.turn_router.memory_prestream_budget_ms",
            return_value=50.0,
        ),
    ):
        block, status = await fetch_hybrid_memory_block(
            query="what did we discuss?",
            user_id="u1",
            skip_episodic=False,
            timings=timings,
        )
    assert "late hit" in block
    assert status is True
    assert timings.get("rag_within_budget") == 0.0
