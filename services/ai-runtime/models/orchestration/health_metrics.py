from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Deque, Dict, List, Optional, Tuple

from models.config_loader import get_orchestration_config

_P95_WINDOW_SECONDS = 40.0


@dataclass
class ProviderSample:
    success: bool
    latency_ms: float
    timestamp: float = field(default_factory=time.time)


class HealthMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self._windows: Dict[str, Deque[ProviderSample]] = {}

    @staticmethod
    def _route_key(provider: str, task: Optional[str] = None) -> str:
        return f"{provider}:{task or '*'}"

    def _window(self, route_key: str) -> Deque[ProviderSample]:
        size = get_orchestration_config()["windowSize"]
        if route_key not in self._windows:
            self._windows[route_key] = deque(maxlen=size)
        return self._windows[route_key]

    def record(
        self,
        provider: str,
        *,
        success: bool,
        latency_ms: float,
        task: Optional[str] = None,
    ) -> None:
        route_key = self._route_key(provider, task)
        with self._lock:
            self._window(route_key).append(
                ProviderSample(success=success, latency_ms=latency_ms)
            )

    def _recent_samples(self, route_key: str) -> List[ProviderSample]:
        cutoff = time.time() - _P95_WINDOW_SECONDS
        with self._lock:
            samples = [s for s in self._windows.get(route_key, []) if s.timestamp >= cutoff]
        return samples

    def stats(self, provider: str, *, task: Optional[str] = None) -> Dict[str, Optional[float]]:
        route_key = self._route_key(provider, task)
        with self._lock:
            samples = list(self._window(route_key))
        recent = [s for s in samples if s.timestamp >= time.time() - _P95_WINDOW_SECONDS]
        if not samples:
            return {
                "avg_latency_ms": None,
                "p95_latency_ms": None,
                "success_rate": None,
                "sample_size": 0,
                "failures_in_window": 0,
            }
        successes = sum(1 for s in samples if s.success)
        failures = len(samples) - successes
        avg_lat = sum(s.latency_ms for s in samples) / len(samples)
        p95 = None
        if recent:
            latencies = sorted(s.latency_ms for s in recent)
            idx = max(0, int(len(latencies) * 0.95) - 1)
            p95 = latencies[idx]
        return {
            "avg_latency_ms": round(avg_lat, 1),
            "p95_latency_ms": round(p95, 1) if p95 is not None else None,
            "success_rate": round(successes / len(samples), 4),
            "sample_size": len(samples),
            "failures_in_window": failures,
        }

    def sort_models_by_latency(
        self,
        model_ids: List[str],
        provider_fn,
        *,
        task: Optional[str] = None,
    ) -> List[str]:
        def sort_key(model_id: str) -> Tuple[float, str]:
            provider = provider_fn(model_id)
            st = self.stats(provider, task=task)
            lat = st.get("p95_latency_ms") or st.get("avg_latency_ms")
            if lat is None:
                return (float("inf"), model_id)
            return (float(lat), model_id)

        return sorted(model_ids, key=sort_key)

    def all_provider_stats(
        self, providers: List[str], *, task: Optional[str] = None
    ) -> Dict[str, Dict[str, Optional[float]]]:
        return {p: self.stats(p, task=task) for p in providers}

    def route_keys(self) -> List[str]:
        with self._lock:
            return list(self._windows.keys())


health_metrics = HealthMetrics()
