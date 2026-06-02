import os
from unittest.mock import AsyncMock, patch

import pytest

from orchestration.context import (
    build_context,
    is_rag_globally_enabled,
    merge_context_blocks,
)


def test_merge_context_blocks_skips_empty():
    assert merge_context_blocks("", "  ", "hello", "world") == "hello\n\nworld"


def test_merge_context_blocks_single():
    assert merge_context_blocks("only") == "only"


@pytest.mark.parametrize(
    "value,expected",
    [
        ("true", True),
        ("TRUE", True),
        ("false", False),
        ("0", False),
        ("no", False),
        ("off", False),
    ],
)
def test_is_rag_globally_enabled(monkeypatch, value, expected):
    monkeypatch.setenv("RAG_ENABLED", value)
    assert is_rag_globally_enabled() is expected


def test_is_rag_globally_enabled_defaults_true(monkeypatch):
    monkeypatch.delenv("RAG_ENABLED", raising=False)
    assert is_rag_globally_enabled() is True


@pytest.mark.asyncio
async def test_build_context_uses_prefetched_rag_block():
    fetch_rag = AsyncMock(return_value="should-not-be-called")
    with patch("orchestration.context.fetch_rag_context", fetch_rag):
        result = await build_context(
            "query",
            "user-1",
            [],
            rag_enabled=True,
            manifest_text="manifest",
            rag_block="Retrieved:\n- cached hit",
        )
    fetch_rag.assert_not_called()
    assert "manifest" in result
    assert "cached hit" in result


@pytest.mark.asyncio
async def test_build_context_fetches_rag_when_block_not_provided():
    with patch(
        "orchestration.context.fetch_rag_context",
        AsyncMock(return_value="Retrieved:\n- live hit"),
    ) as fetch_rag:
        result = await build_context(
            "query",
            "user-1",
            [],
            rag_enabled=True,
            manifest_text="",
            include_manifest=False,
        )
    fetch_rag.assert_awaited_once()
    assert "live hit" in result
