from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

# services/ai-runtime as import root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.config_loader import load_ai_models_config
from llm.provider_monitor import CircuitBreaker
from llm.provider_monitor import HealthMetrics
from llm.provider_router import tiers_for_task


class TestCircuitBreakerRate(unittest.TestCase):
    def setUp(self) -> None:
        load_ai_models_config(reload=True)
        self.breaker = CircuitBreaker()

    def test_stays_closed_with_few_failures_in_large_window(self) -> None:
        for _ in range(45):
            self.breaker.record_success("nvidia")
        for _ in range(5):
            self.breaker.record_failure("nvidia")
        self.assertFalse(self.breaker.is_open("nvidia"))

    def test_opens_when_failure_rate_exceeds_half(self) -> None:
        for _ in range(26):
            self.breaker.record_failure("groq")
        for _ in range(24):
            self.breaker.record_success("groq")
        self.assertTrue(self.breaker.is_open("groq"))


class TestHealthMetricsLatencySort(unittest.TestCase):
    def test_sorts_by_avg_latency(self) -> None:
        metrics = HealthMetrics()
        metrics.record("nvidia", success=True, latency_ms=2000)
        metrics.record("groq", success=True, latency_ms=500)
        ranked = metrics.sort_models_by_latency(
            ["nvidia/mistral-nemotron", "groq/llama-3.3-70b"],
            lambda m: "groq" if m.startswith("groq/") else "nvidia",
        )
        self.assertEqual(ranked[0], "groq/llama-3.3-70b")


class TestRoutingTiers(unittest.TestCase):
    def setUp(self) -> None:
        load_ai_models_config(reload=True)

    def test_fast_chat_tier1_has_two_models(self) -> None:
        tiers = tiers_for_task("fast_chat")
        self.assertGreaterEqual(len(tiers["tier1"]), 1)
        self.assertGreaterEqual(len(tiers["tier2"]), 1)

    def test_coding_tier1_uses_qwen_next_and_gpt_oss_120b(self) -> None:
        tiers = tiers_for_task("coding")
        self.assertEqual(
            tiers["tier1"],
            ["nvidia/qwen3-next-80b", "groq/gpt-oss-120b"],
        )


class TestAdaptiveRace(unittest.TestCase):
    def setUp(self) -> None:
        load_ai_models_config(reload=True)

    def test_healthy_primary_returns_single_candidate(self) -> None:
        from llm.stream_race import _adaptive_candidates

        metrics = HealthMetrics()
        for _ in range(10):
            metrics.record("groq", success=True, latency_ms=400, task="fast_chat")
        with patch("llm.stream_race.health_metrics", metrics):
            candidates = _adaptive_candidates(
                ["groq/llama-3.3-70b", "nvidia/deepseek-v4-flash"],
                task="fast_chat",
                race_meta={},
            )
        self.assertEqual(len(candidates), 1)

    def test_degraded_primary_races_top_two(self) -> None:
        from llm.stream_race import _adaptive_candidates

        metrics = HealthMetrics()
        for _ in range(6):
            metrics.record("groq", success=False, latency_ms=400, task="fast_chat")
        metrics.record("nvidia", success=True, latency_ms=800, task="fast_chat")
        with patch(
            "llm.stream_race.health_metrics", metrics
        ):
            candidates = _adaptive_candidates(
                ["groq/llama-3.3-70b", "nvidia/deepseek-v4-flash"],
                task="fast_chat",
                race_meta={},
            )
        self.assertEqual(len(candidates), 2)

    def test_cold_start_uses_latency_ranked_primary(self) -> None:
        from llm.stream_race import _adaptive_candidates

        metrics = HealthMetrics()
        metrics.record("groq", success=True, latency_ms=300, task="fast_chat")
        metrics.record("nvidia", success=True, latency_ms=2000, task="fast_chat")
        with patch(
            "llm.stream_race.health_metrics", metrics
        ):
            candidates = _adaptive_candidates(
                ["nvidia/deepseek-v4-flash", "groq/llama-3.3-70b"],
                task="fast_chat",
                race_meta={},
            )
        self.assertEqual(candidates[0], "groq/llama-3.3-70b")
        self.assertEqual(len(candidates), 1)


class TestTierRaceCancel(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_event_aborts_race(self) -> None:
        from llm.stream_race import race_tier

        cancel = asyncio.Event()
        cancel.set()

        with patch(
            "llm.stream_race._filter_models",
            return_value=["groq/llama-3.3-70b"],
        ), patch(
            "llm.stream_race.iter_tier_race_tokens",
            side_effect=asyncio.CancelledError(),
        ):
            result = await race_tier(
                ["groq/llama-3.3-70b"],
                [{"role": "user", "content": "hi"}],
                task="fast_chat",
                cancel_event=cancel,
            )
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
