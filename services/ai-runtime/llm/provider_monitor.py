from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Deque, Dict, List, Literal, Optional, Tuple

from models.config_loader import get_orchestration_config

CircuitState = Literal["closed", "open", "half_open"]
_P95_WINDOW_SECONDS = 40.0


@dataclass
class ProviderCircuit:
    state: CircuitState = "closed"
    retry_after: float = 0.0
    outcomes: Deque[bool] = None

    def __post_init__(self) -> None:
        if self.outcomes is None:
            size = get_orchestration_config()["windowSize"]
            self.outcomes = deque(maxlen=size)


class CircuitBreaker:
    def __init__(self) -> None:
        self._circuits: Dict[str, ProviderCircuit] = {}

    @staticmethod
    def _route_key(provider: str, task: Optional[str] = None) -> str:
        return f"{provider}:{task or '*'}"

    def _circuit(self, route_key: str) -> ProviderCircuit:
        if route_key not in self._circuits:
            self._circuits[route_key] = ProviderCircuit()
        return self._circuits[route_key]

    def is_open(self, provider: str, *, task: Optional[str] = None) -> bool:
        if not provider:
            return False
        route_key = self._route_key(provider, task)
        now = time.time()
        c = self._circuit(route_key)
        if c.state == "open" and now >= c.retry_after:
            c.state = "half_open"
        if c.state == "open":
            return True
        if c.state == "half_open":
            return False
        return False

    def _reevaluate(self, c: ProviderCircuit, *, now: float) -> None:
        cfg = get_orchestration_config()
        if len(c.outcomes) < cfg["minSamplesToOpen"]:
            if c.state != "open":
                c.state = "closed"
            return
        failures = sum(1 for ok in c.outcomes if not ok)
        rate = failures / len(c.outcomes)
        if rate > cfg["failureRateThreshold"]:
            c.state = "open"
            c.retry_after = now + cfg["openDurationSeconds"]
        elif c.state != "open":
            c.state = "closed"

    def record_success(self, provider: str, *, task: Optional[str] = None) -> None:
        if not provider:
            return
        route_key = self._route_key(provider, task)
        now = time.time()
        c = self._circuit(route_key)
        c.outcomes.append(True)
        if c.state == "open" and now < c.retry_after:
            return
        self._reevaluate(c, now=now)

    def record_failure(self, provider: str, *, task: Optional[str] = None) -> None:
        if not provider:
            return
        route_key = self._route_key(provider, task)
        now = time.time()
        c = self._circuit(route_key)
        c.outcomes.append(False)
        self._reevaluate(c, now=now)

    def snapshot(
        self, provider: str, *, task: Optional[str] = None
    ) -> Dict[str, object]:
        cfg = get_orchestration_config()
        route_key = self._route_key(provider, task)
        c = self._circuit(route_key)
        outcomes = list(c.outcomes)
        failures = sum(1 for ok in outcomes if not ok)
        rate = failures / len(outcomes) if outcomes else None
        return {
            "route": route_key,
            "circuit": c.state,
            "retry_after": c.retry_after if c.state == "open" else None,
            "window_size": len(outcomes),
            "failures_in_window": failures,
            "failure_rate": round(rate, 4) if rate is not None else None,
            "max_window": cfg["windowSize"],
        }


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

    def should_race_primary(
        self,
        provider: str,
        *,
        task: Optional[str] = None,
        threshold: float = 0.9,
        min_samples: int = 5,
    ) -> bool:
        st = self.stats(provider, task=task)
        sample_size = int(st.get("sample_size") or 0)
        if sample_size < min_samples:
            return False
        success_rate = st.get("success_rate")
        if success_rate is None:
            return False
        return float(success_rate) < threshold

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


circuit_breaker = CircuitBreaker()
health_metrics = HealthMetrics()
