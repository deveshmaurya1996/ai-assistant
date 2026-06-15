from __future__ import annotations

import logging
import math
import time
from typing import Any, Dict, List, Optional

from models.config_loader import get_health_monitor_config
from llm import redis_store

logger = logging.getLogger(__name__)

_DEFAULT_HEALTH: Dict[str, Any] = {
    "state": "healthy",
    "requestCount1h": 0,
    "requestSuccess1h": 0,
    "latencySum1h": 0.0,
    "latencySamples1h": [],
    "windowStart": 0.0,
    "updatedAt": 0.0,
}

_DEFAULT_CIRCUIT: Dict[str, Any] = {
    "state": "healthy",
    "failures": 0,
    "retryAfter": 0.0,
}


def _window_seconds() -> float:
    return float(get_health_monitor_config().get("requestTelemetryWindowSeconds", 3600))


def _p95(samples: List[float]) -> Optional[float]:
    if not samples:
        return None
    ordered = sorted(samples)
    idx = max(0, int(math.ceil(len(ordered) * 0.95)) - 1)
    return float(ordered[idx])


def _maybe_reset(stats: Dict[str, Any], now: float) -> None:
    window = _window_seconds()
    start = float(stats.get("windowStart") or 0)
    if start <= 0 or now - start >= window:
        stats["requestCount1h"] = 0
        stats["requestSuccess1h"] = 0
        stats["latencySum1h"] = 0.0
        stats["latencySamples1h"] = []
        stats["windowStart"] = now


async def _load_health(provider: str, region: str) -> Dict[str, Any]:
    key = redis_store.provider_health_key(provider, region)
    data = await redis_store.get_json(key)
    if not data:
        return dict(_DEFAULT_HEALTH)
    merged = dict(_DEFAULT_HEALTH)
    merged.update(data)
    return merged


async def _save_health(provider: str, region: str, health: Dict[str, Any]) -> None:
    health["updatedAt"] = time.time()
    await redis_store.set_json(
        redis_store.provider_health_key(provider, region),
        health,
        ttl_seconds=int(_window_seconds()) + 300,
    )


async def _load_circuit(provider: str, region: str) -> Dict[str, Any]:
    data = await redis_store.get_json(redis_store.provider_circuit_key(provider, region))
    if not data:
        return dict(_DEFAULT_CIRCUIT)
    merged = dict(_DEFAULT_CIRCUIT)
    merged.update(data)
    return merged


async def _save_circuit(provider: str, region: str, circuit: Dict[str, Any]) -> None:
    await redis_store.set_json(redis_store.provider_circuit_key(provider, region), circuit)


async def record_provider_outcome(
    provider: str,
    *,
    success: bool,
    latency_ms: float,
    region: Optional[str] = None,
) -> None:
    if not provider:
        return
    reg = region or redis_store.runtime_region()
    now = time.time()
    health = await _load_health(provider, reg)
    _maybe_reset(health, now)

    health["requestCount1h"] = int(health.get("requestCount1h") or 0) + 1
    if success:
        health["requestSuccess1h"] = int(health.get("requestSuccess1h") or 0) + 1
        if health.get("state") == "warming":
            health["state"] = "healthy"
    else:
        health["state"] = "degraded"

    if success and latency_ms >= 0:
        health["latencySum1h"] = float(health.get("latencySum1h") or 0) + latency_ms
        samples: List[float] = list(health.get("latencySamples1h") or [])
        samples.append(float(latency_ms))
        if len(samples) > 500:
            samples = samples[-500:]
        health["latencySamples1h"] = samples

    await _save_health(provider, reg, health)

    cfg = get_health_monitor_config()
    circuit = await _load_circuit(provider, reg)
    if circuit.get("state") == "open" and now >= float(circuit.get("retryAfter") or 0):
        circuit["state"] = "warming"
        circuit["failures"] = 0

    if success:
        circuit["failures"] = 0
        if circuit.get("state") in ("open", "degraded"):
            circuit["state"] = "healthy"
    else:
        circuit["failures"] = int(circuit.get("failures") or 0) + 1
        threshold = int(cfg.get("circuitConsecutiveFailures", 5))
        if circuit["failures"] >= threshold:
            circuit["state"] = "open"
            circuit["retryAfter"] = now + float(cfg.get("providerCircuitOpenSeconds", 600))
            health["state"] = "open"
            await _save_health(provider, reg, health)

    await _save_circuit(provider, reg, circuit)


async def is_provider_available(provider: str, region: Optional[str] = None) -> bool:
    reg = region or redis_store.runtime_region()
    for try_region in (reg, "global"):
        circuit = await _load_circuit(provider, try_region)
        state = str(circuit.get("state") or "warming")
        if state in ("open",):
            if time.time() < float(circuit.get("retryAfter") or 0):
                continue
        return True
    return False


async def get_provider_snapshot(provider: str, region: Optional[str] = None) -> Dict[str, Any]:
    reg = region or redis_store.runtime_region()
    health = await _load_health(provider, reg)
    circuit = await _load_circuit(provider, reg)
    samples = list(health.get("latencySamples1h") or [])
    count = int(health.get("requestCount1h") or 0)
    success = int(health.get("requestSuccess1h") or 0)
    rate = (success / count) if count else None
    return {
        "provider": provider,
        "region": reg,
        "state": circuit.get("state") or health.get("state"),
        "successRate1h": round(rate, 4) if rate is not None else None,
        "p95Latency1h": round(_p95(samples), 1) if samples else None,
        "sampleCount1h": count,
        "failures": int(circuit.get("failures") or 0),
    }
