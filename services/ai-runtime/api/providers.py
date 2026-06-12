from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter

from models.orchestration.circuit_breaker import circuit_breaker
from models.orchestration.health_metrics import health_metrics
from models.orchestration.provider_registry import provider_config

router = APIRouter()


def _provider_configured(provider: str) -> bool:
    prov = provider_config(provider)
    env_name = prov.get("apiKeyEnv")
    if not env_name:
        return False
    return bool(os.getenv(str(env_name), "").strip())


def _status_label(
    *,
    configured: bool,
    circuit: str,
    success_rate: float | None,
) -> str:
    if not configured:
        return "unconfigured"
    if circuit == "open":
        return "open"
    if success_rate is not None and success_rate < 0.8:
        return "degraded"
    return "healthy"


@router.get("/providers/health")
def providers_health() -> Dict[str, Any]:
    out: Dict[str, Any] = {"providers": {}, "routes": {}}
    for name in ("nvidia", "groq", "pollinations"):
        configured = _provider_configured(name)
        metrics = health_metrics.stats(name, task="fast_chat")
        breaker = circuit_breaker.snapshot(name, task="fast_chat")
        success_rate = metrics.get("success_rate")
        circuit = str(breaker.get("circuit", "closed"))
        out["providers"][name] = {
            "status": _status_label(
                configured=configured,
                circuit=circuit,
                success_rate=success_rate,
            ),
            "circuit": circuit,
            "configured": configured,
            "latencyMs": metrics.get("avg_latency_ms"),
            "p95LatencyMs": metrics.get("p95_latency_ms"),
            "successRate": success_rate,
            "windowSize": metrics.get("sample_size", 0),
            "failuresInWindow": metrics.get("failures_in_window", 0),
            "failureRate": breaker.get("failure_rate"),
        }
    for key in health_metrics.route_keys():
        provider, task = key.split(":", 1)
        out["routes"][key] = health_metrics.stats(
            provider, task=None if task == "*" else task
        )
    return out
