import pytest

from orchestration.prompt_compression import (
    compression_threshold_tokens,
    compress_prompt_if_needed,
    estimate_tokens,
)


def test_estimate_tokens_uses_char_heuristic():
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("a" * 400) == 100


def test_adaptive_threshold_scales_with_context_window(monkeypatch):
    monkeypatch.delenv("PROMPT_COMPRESS_TOKEN_THRESHOLD", raising=False)
    threshold = compression_threshold_tokens("fast_chat")
    assert threshold >= 16_000


@pytest.mark.asyncio
async def test_under_threshold_is_noop():
    history, context, timings = await compress_prompt_if_needed(
        chat_history=[{"role": "user", "content": "hi"}],
        context_str=None,
        tool_context="",
        user_query="hi",
        user_id="u1",
        task="fast_chat",
        speed_profile="fast_response",
        deadline_ms=30_000,
    )
    assert history == [{"role": "user", "content": "hi"}]
    assert timings.get("compress_ms") == 0.0


@pytest.mark.asyncio
async def test_voice_profile_skips_compression():
    history = [{"role": "user", "content": "x" * 50_000}]
    compressed, _, timings = await compress_prompt_if_needed(
        chat_history=history,
        context_str="y" * 50_000,
        tool_context="",
        user_query="speak",
        user_id="u1",
        task="fast_chat",
        speed_profile="voice_realtime",
        deadline_ms=15_000,
    )
    assert compressed == history
    assert timings.get("compress_skipped") == 1.0
