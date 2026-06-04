from __future__ import annotations

import os
import time
from collections import deque
from dataclasses import dataclass
from threading import Lock
from typing import Deque, Dict, Literal

from models.config_loader import get_orchestration_config

CircuitState = Literal["closed", "open", "half_open"]


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
        self._lock = Lock()
        self._circuits: Dict[str, ProviderCircuit] = {}

    def _circuit(self, provider: str) -> ProviderCircuit:
        if provider not in self._circuits:
            self._circuits[provider] = ProviderCircuit()
        return self._circuits[provider]

    def is_open(self, provider: str) -> bool:
        if not provider:
            return False
        cfg = get_orchestration_config()
        now = time.time()
        with self._lock:
            c = self._circuit(provider)
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

    def record_success(self, provider: str) -> None:
        if not provider:
            return
        now = time.time()
        with self._lock:
            c = self._circuit(provider)
            c.outcomes.append(True)
            if c.state == "open" and now < c.retry_after:
                return
            self._reevaluate(c, now=now)

    def record_failure(self, provider: str) -> None:
        if not provider:
            return
        now = time.time()
        with self._lock:
            c = self._circuit(provider)
            c.outcomes.append(False)
            self._reevaluate(c, now=now)

    def snapshot(self, provider: str) -> Dict[str, object]:
        cfg = get_orchestration_config()
        with self._lock:
            c = self._circuit(provider)
            outcomes = list(c.outcomes)
        failures = sum(1 for ok in outcomes if not ok)
        rate = failures / len(outcomes) if outcomes else None
        return {
            "circuit": c.state,
            "retry_after": c.retry_after if c.state == "open" else None,
            "window_size": len(outcomes),
            "failures_in_window": failures,
            "failure_rate": round(rate, 4) if rate is not None else None,
            "max_window": cfg["windowSize"],
        }


circuit_breaker = CircuitBreaker()
