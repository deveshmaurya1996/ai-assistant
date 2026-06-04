from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

# services/ai-runtime as import root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.config_loader import load_ai_models_config
from models.orchestration.circuit_breaker import CircuitBreaker
from models.orchestration.health_metrics import HealthMetrics
from models.orchestration.provider_registry import tiers_for_task


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
    def test_fast_chat_tier1_has_two_models(self) -> None:
        load_ai_models_config(reload=True)
        tiers = tiers_for_task("fast_chat")
        self.assertIn("nvidia/mistral-nemotron", tiers["tier1"])
        self.assertIn("groq/llama-3.3-70b", tiers["tier1"])
        self.assertEqual(len(tiers["tier2"]), 2)


class TestTierRaceCancel(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_event_aborts_race(self) -> None:
        from models.orchestration.stream_race import race_tier

        cancel = asyncio.Event()
        cancel.set()

        with patch(
            "models.orchestration.stream_race._filter_models",
            return_value=["groq/llama-3.3-70b"],
        ):
            with patch(
                "models.orchestration.stream_race._probe_first_token",
                new_callable=AsyncMock,
                side_effect=asyncio.CancelledError(),
            ):
                result = await race_tier(
                    ["groq/llama-3.3-70b"],
                    [{"role": "user", "content": "hi"}],
                    cancel_event=cancel,
                )
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
