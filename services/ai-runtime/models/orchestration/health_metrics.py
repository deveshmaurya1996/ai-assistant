from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Deque, Dict, List, Optional, Tuple

from models.config_loader import get_orchestration_config


@dataclass
class ProviderSample:
    success: bool
    latency_ms: float
    timestamp: float = field(default_factory=time.time)


class HealthMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self._windows: Dict[str, Deque[ProviderSample]] = {}

    def _window(self, provider: str) -> Deque[ProviderSample]:
        size = get_orchestration_config()["windowSize"]
        if provider not in self._windows:
            self._windows[provider] = deque(maxlen=size)
        return self._windows[provider]

    def record(
        self,
        provider: str,
        *,
        success: bool,
        latency_ms: float,
    ) -> None:
        with self._lock:
            self._window(provider).append(
                ProviderSample(success=success, latency_ms=latency_ms)
            )

    def stats(self, provider: str) -> Dict[str, Optional[float]]:
        with self._lock:
            samples = list(self._window(provider))
        if not samples:
            return {
                "avg_latency_ms": None,
                "success_rate": None,
                "sample_size": 0,
                "failures_in_window": 0,
            }
        successes = sum(1 for s in samples if s.success)
        failures = len(samples) - successes
        avg_lat = sum(s.latency_ms for s in samples) / len(samples)
        return {
            "avg_latency_ms": round(avg_lat, 1),
            "success_rate": round(successes / len(samples), 4),
            "sample_size": len(samples),
            "failures_in_window": failures,
        }

    def sort_models_by_latency(self, model_ids: List[str], provider_fn) -> List[str]:
        """Sort model ids by provider avg_latency_ms (lowest first)."""

        def sort_key(model_id: str) -> Tuple[float, str]:
            provider = provider_fn(model_id)
            st = self.stats(provider)
            lat = st.get("avg_latency_ms")
            if lat is None:
                return (float("inf"), model_id)
            return (float(lat), model_id)

        return sorted(model_ids, key=sort_key)

    def all_provider_stats(self, providers: List[str]) -> Dict[str, Dict[str, Optional[float]]]:
        return {p: self.stats(p) for p in providers}


health_metrics = HealthMetrics()
