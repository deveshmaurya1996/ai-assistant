from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, Literal, Optional

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
        cfg = get_orchestration_config()
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


circuit_breaker = CircuitBreaker()
