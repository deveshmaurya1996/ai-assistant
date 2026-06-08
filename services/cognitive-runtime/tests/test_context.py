import os
import time
from unittest.mock import AsyncMock, patch

import pytest

from orchestration.context import (
    _manifest_cache,
    build_context,
    fetch_integration_manifest,
    invalidate_integration_manifest,
    is_assistant_meta_query,
    is_memory_recall_query,
    is_rag_globally_enabled,
    is_smalltalk_query,
    merge_context_blocks,
    should_retrieve_rag_context,
    should_retrieve_rag_context_async,
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
            "what did we discuss?",
            "user-1",
            [],
            rag_enabled=True,
            manifest_text="manifest",
            rag_block="Retrieved:\n- cached hit",
        )
    fetch_rag.assert_not_called()
    assert "manifest" in result
    assert "cached hit" in result


@pytest.mark.parametrize(
    "query,expected",
    [
        ("hello", False),
        ("thanks!", False),
        ("check my email", False),
        ("what did we discuss about the project?", True),
        ("do you remember my preference?", True),
        ("explain this pdf", False),
    ],
)
def test_should_retrieve_rag_context(query, expected):
    assert should_retrieve_rag_context(query) is expected


@pytest.mark.parametrize(
    "query,expected",
    [
        ("who are you?", True),
        ("what is your name?", True),
        ("What's your name", True),
        ("help me with code", False),
    ],
)
def test_is_assistant_meta_query(query, expected):
    assert is_assistant_meta_query(query) is expected


@pytest.mark.parametrize(
    "query,expected",
    [
        ("hi", True),
        ("how are you", True),
        ("hello!", True),
        ("what did we discuss last week?", False),
    ],
)
def test_is_smalltalk_query(query, expected):
    assert is_smalltalk_query(query) is expected


@pytest.mark.parametrize(
    "query,expected",
    [
        ("what did we discuss about the project?", True),
        ("do you remember my preference?", True),
        ("hi", False),
        ("what is your name?", False),
    ],
)
def test_is_memory_recall_query(query, expected):
    assert is_memory_recall_query(query) is expected


@pytest.mark.asyncio
async def test_should_retrieve_rag_context_async_memory_skips_llm_router():
    llm = AsyncMock(return_value=False)
    with patch("orchestration.context._should_retrieve_via_llm", llm):
        assert (
            await should_retrieve_rag_context_async("what did we discuss last week?")
            is True
        )
    llm.assert_not_called()


def test_should_retrieve_rag_context_with_file_skips_generic_summarize():
    assert should_retrieve_rag_context("summarize this document", has_file_context=True) is False
    assert (
        should_retrieve_rag_context(
            "what did I save in my notes about this file?", has_file_context=True
        )
        is True
    )


@pytest.mark.asyncio
async def test_build_context_skips_rag_for_casual_query():
    fetch_rag = AsyncMock(return_value="should-not-be-called")
    with patch("orchestration.context.fetch_rag_context", fetch_rag):
        result = await build_context(
            "hello there",
            "user-1",
            [],
            rag_enabled=True,
            include_manifest=False,
        )
    fetch_rag.assert_not_called()
    assert result == ""


@pytest.mark.asyncio
async def test_build_context_uses_provided_rag_block():
    with patch(
        "orchestration.context.fetch_rag_context",
        AsyncMock(return_value="should-not-be-called"),
    ) as fetch_rag:
        result = await build_context(
            "what did we discuss last time?",
            "user-1",
            [],
            rag_enabled=True,
            manifest_text="",
            include_manifest=False,
            rag_block="Retrieved:\n- pre-fetched hit",
        )
    fetch_rag.assert_not_called()
    assert "pre-fetched hit" in result


@pytest.mark.asyncio
async def test_build_context_fetches_curated_facts_when_block_not_provided():
    with (
        patch(
            "orchestration.context.fetch_rag_context",
            AsyncMock(return_value="should-not-be-called"),
        ) as fetch_rag,
        patch(
            "orchestration.context.fetch_curated_facts_block",
            AsyncMock(return_value="Known facts:\n- likes tea"),
        ) as fetch_facts,
    ):
        result = await build_context(
            "what did we discuss last time?",
            "user-1",
            [],
            rag_enabled=True,
            manifest_text="",
            include_manifest=False,
        )
    fetch_rag.assert_not_called()
    fetch_facts.assert_awaited_once()
    assert "likes tea" in result


@pytest.mark.asyncio
async def test_fetch_layered_memory_context_merges_facts_and_episodic():
    from orchestration.context import fetch_layered_memory_context

    with (
        patch(
            "orchestration.context.fetch_curated_facts_block",
            AsyncMock(return_value="Known facts:\n- likes tea"),
        ),
        patch(
            "orchestration.context.fetch_rag_context",
            AsyncMock(return_value="Retrieved:\n- past chat snippet"),
        ),
    ):
        block = await fetch_layered_memory_context("what did we discuss?", "user-1")

    assert "likes tea" in block
    assert "past chat snippet" in block


def test_invalidate_integration_manifest_clears_cache():
    _manifest_cache["user-x"] = (time.monotonic() + 60, "cached", {"cap"}, [])
    invalidate_integration_manifest("user-x")
    assert "user-x" not in _manifest_cache


@pytest.mark.asyncio
async def test_fetch_integration_manifest_prefers_gateway_over_skill():
    gateway_payload = (
        "Connected apps (ACTIVE): google.",
        {"email.list_unread"},
        [{"id": "google_u1", "providerId": "google"}],
    )
    skill_payload = (
        "Connected apps (ACTIVE): google, whatsapp.",
        {"email.list_unread", "messaging.list_unread"},
        [{"id": "whatsapp_u1", "providerId": "whatsapp"}],
    )

    with (
        patch(
            "orchestration.context._fetch_manifest_endpoint",
            AsyncMock(side_effect=[gateway_payload, skill_payload]),
        ),
        patch.dict("orchestration.context._manifest_cache", {}, clear=True),
    ):
        text, caps, connections = await fetch_integration_manifest("user-1")

    assert "google" in text
    assert "whatsapp" not in text
    assert caps == {"email.list_unread"}
    assert len(connections) == 1
