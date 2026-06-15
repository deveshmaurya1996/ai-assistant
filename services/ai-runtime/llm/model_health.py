from __future__ import annotations

import logging
import math
import time
from typing import Any, Dict, List, Literal, Optional

from models.config_loader import get_health_monitor_config, get_model_capabilities
from llm import overrides as model_overrides
from llm import redis_store

logger = logging.getLogger(__name__)

HealthState = Literal["warming", "healthy", "degraded", "open", "quarantined"]

_DEFAULT_STATS: Dict[str, Any] = {
    "requestCount1h": 0,
    "requestSuccess1h": 0,
    "probeCount1h": 0,
    "probeSuccess1h": 0,
    "latencySum1h": 0.0,
    "latencySamples1h": [],
    "windowStart": 0.0,
    "updatedAt": 0.0,
}

_DEFAULT_CIRCUIT: Dict[str, Any] = {
    "state": "healthy",
    "failures": 0,
    "consecutiveSuccesses": 0,
    "retryAfter": 0.0,
    "baselineP95Ms": None,
}


def _cfg() -> Dict[str, Any]:
    return get_health_monitor_config()


def _window_seconds() -> float:
    return float(_cfg().get("requestTelemetryWindowSeconds", 3600))


def _maybe_reset_window(stats: Dict[str, Any], now: float) -> None:
    window = _window_seconds()
    start = float(stats.get("windowStart") or 0)
    if start <= 0 or now - start >= window:
        stats["requestCount1h"] = 0
        stats["requestSuccess1h"] = 0
        stats["probeCount1h"] = 0
        stats["probeSuccess1h"] = 0
        stats["latencySum1h"] = 0.0
        stats["latencySamples1h"] = []
        stats["windowStart"] = now


def _p95(samples: List[float]) -> Optional[float]:
    if not samples:
        return None
    ordered = sorted(samples)
    idx = max(0, int(math.ceil(len(ordered) * 0.95)) - 1)
    return float(ordered[idx])


def _blend_success_rate(stats: Dict[str, Any]) -> Optional[float]:
    req_c = int(stats.get("requestCount1h") or 0)
    req_s = int(stats.get("requestSuccess1h") or 0)
    probe_c = int(stats.get("probeCount1h") or 0)
    probe_s = int(stats.get("probeSuccess1h") or 0)
    weight = float(_cfg().get("requestTelemetryWeight", 0.7))
    total = req_c + probe_c
    if total <= 0:
        return None
    req_rate = (req_s / req_c) if req_c else None
    probe_rate = (probe_s / probe_c) if probe_c else None
    if req_rate is not None and probe_rate is not None:
        return req_rate * weight + probe_rate * (1.0 - weight)
    if req_rate is not None:
        return req_rate
    return probe_rate


async def _load_stats(model_id: str) -> Dict[str, Any]:
    data = await redis_store.get_json(redis_store.model_stats_key(model_id))
    if not data:
        return dict(_DEFAULT_STATS)
    merged = dict(_DEFAULT_STATS)
    merged.update(data)
    return merged


async def _save_stats(model_id: str, stats: Dict[str, Any]) -> None:
    stats["updatedAt"] = time.time()
    await redis_store.set_json(
        redis_store.model_stats_key(model_id),
        stats,
        ttl_seconds=int(_window_seconds()) + 300,
    )


async def _load_circuit(model_id: str) -> Dict[str, Any]:
    data = await redis_store.get_json(redis_store.model_circuit_key(model_id))
    if not data:
        return dict(_DEFAULT_CIRCUIT)
    merged = dict(_DEFAULT_CIRCUIT)
    merged.update(data)
    return merged


async def _save_circuit(model_id: str, circuit: Dict[str, Any]) -> None:
    await redis_store.set_json(redis_store.model_circuit_key(model_id), circuit)


def _effective_state(circuit: Dict[str, Any], override: Optional[model_overrides.ModelOverride]) -> HealthState:
    if override and override.quarantined:
        return "quarantined"
    state = str(circuit.get("state") or "warming")
    if state in ("warming", "healthy", "degraded", "open", "quarantined"):
        return state  # type: ignore[return-value]
    return "warming"


async def get_stats_1h(model_id: str) -> Dict[str, Any]:
    stats = await _load_stats(model_id)
    samples = list(stats.get("latencySamples1h") or [])
    p95 = _p95(samples)
    req_count = int(stats.get("requestCount1h") or 0)
    probe_count = int(stats.get("probeCount1h") or 0)
    success_rate = _blend_success_rate(stats)
    return {
        "successRate1h": round(success_rate, 4) if success_rate is not None else None,
        "p95Latency1h": round(p95, 1) if p95 is not None else None,
        "sampleCount1h": req_count + probe_count,
        "requestCount1h": req_count,
        "probeCount1h": probe_count,
        "updatedAt": stats.get("updatedAt"),
    }


async def get_effective_state(model_id: str) -> HealthState:
    circuit = await _load_circuit(model_id)
    await model_overrides.refresh_overrides_from_db()
    ov = model_overrides.get_override(model_id)
    return _effective_state(circuit, ov)


async def get_snapshot(model_id: str) -> Dict[str, Any]:
    stats = await get_stats_1h(model_id)
    circuit = await _load_circuit(model_id)
    await model_overrides.refresh_overrides_from_db()
    ov = model_overrides.get_override(model_id)
    state = _effective_state(circuit, ov)
    return {
        "modelId": model_id,
        "state": state,
        **stats,
        "failures": int(circuit.get("failures") or 0),
        "consecutiveSuccesses": int(circuit.get("consecutiveSuccesses") or 0),
        "override": {
            "forcePrimary": bool(ov.force_primary) if ov else False,
            "quarantined": bool(ov.quarantined) if ov else False,
            "maintenanceMode": bool(ov.maintenance_mode) if ov else False,
            "enabled": ov.enabled if ov else None,
        },
    }


async def _update_state_after_outcome(
    model_id: str,
    *,
    success: bool,
    latency_ms: float,
) -> None:
    cfg = _cfg()
    circuit = await _load_circuit(model_id)
    stats = await _load_stats(model_id)
    now = time.time()

    if circuit.get("state") == "open" and now >= float(circuit.get("retryAfter") or 0):
        circuit["state"] = "warming"
        circuit["consecutiveSuccesses"] = 0

    if success:
        circuit["consecutiveSuccesses"] = int(circuit.get("consecutiveSuccesses") or 0) + 1
        circuit["failures"] = 0
        warmup_need = int(cfg.get("warmupSuccessThreshold", 3))
        if circuit.get("state") == "warming" and circuit["consecutiveSuccesses"] >= warmup_need:
            circuit["state"] = "healthy"
        elif circuit.get("state") in ("degraded", "half_open", "warming"):
            if circuit.get("state") != "warming":
                circuit["state"] = "healthy"
    else:
        circuit["consecutiveSuccesses"] = 0
        circuit["failures"] = int(circuit.get("failures") or 0) + 1
        threshold = int(cfg.get("circuitConsecutiveFailures", 5))
        if circuit["failures"] >= threshold:
            circuit["state"] = "open"
            circuit["retryAfter"] = now + float(cfg.get("circuitOpenSeconds", 300))

    p95 = _p95(list(stats.get("latencySamples1h") or []))
    baseline = circuit.get("baselineP95Ms")
    if baseline is None and p95 is not None:
        circuit["baselineP95Ms"] = p95
        baseline = p95

    success_rate = _blend_success_rate(stats)
    degraded_sr = float(cfg.get("degradedSuccessRateThreshold", 0.95))
    degraded_mult = float(cfg.get("degradedLatencyMultiplier", 3))

    if circuit.get("state") == "healthy" and success_rate is not None:
        if success_rate < degraded_sr:
            circuit["state"] = "degraded"
        elif baseline and p95 and p95 > float(baseline) * degraded_mult:
            circuit["state"] = "degraded"

    await _save_circuit(model_id, circuit)


async def _record_outcome(
    model_id: str,
    *,
    success: bool,
    latency_ms: float,
    source: Literal["request", "probe"],
) -> None:
    now = time.time()
    stats = await _load_stats(model_id)
    _maybe_reset_window(stats, now)

    if source == "request":
        stats["requestCount1h"] = int(stats.get("requestCount1h") or 0) + 1
        if success:
            stats["requestSuccess1h"] = int(stats.get("requestSuccess1h") or 0) + 1
    else:
        stats["probeCount1h"] = int(stats.get("probeCount1h") or 0) + 1
        if success:
            stats["probeSuccess1h"] = int(stats.get("probeSuccess1h") or 0) + 1

    if success and latency_ms >= 0:
        stats["latencySum1h"] = float(stats.get("latencySum1h") or 0) + latency_ms
        samples: List[float] = list(stats.get("latencySamples1h") or [])
        samples.append(float(latency_ms))
        if len(samples) > 500:
            samples = samples[-500:]
        stats["latencySamples1h"] = samples

    await _save_stats(model_id, stats)
    await _update_state_after_outcome(model_id, success=success, latency_ms=latency_ms)

    from llm import provider_health

    prov = model_id.split("/")[0] if "/" in model_id else ""
    if prov:
        await provider_health.record_provider_outcome(prov, success=success, latency_ms=latency_ms)


async def record_request(
    model_id: str,
    *,
    task: str,
    latency_ms: float,
    success: bool,
) -> None:
    del task
    await _record_outcome(model_id, success=success, latency_ms=latency_ms, source="request")


async def record_probe(model_id: str, *, latency_ms: float, success: bool) -> None:
    await _record_outcome(model_id, success=success, latency_ms=latency_ms, source="probe")


async def is_available(
    model_id: str,
    *,
    required_caps: Optional[Dict[str, bool]] = None,
    session_model_id: Optional[str] = None,
    allow_degraded: bool = False,
) -> bool:
    from models.model_resolver import model_is_available as yaml_available
    from llm import provider_health

    if not yaml_available(model_id):
        return False

    await model_overrides.refresh_overrides_from_db()
    ov = model_overrides.get_override(model_id)
    if ov and ov.enabled is False:
        return False
    if ov and ov.quarantined:
        return False
    if ov and ov.maintenance_mode and session_model_id != model_id:
        return False
    if ov and ov.maintenance_mode and session_model_id == model_id:
        return True

    if required_caps:
        caps = get_model_capabilities(model_id)
        for key, needed in required_caps.items():
            if needed and not caps.get(key):
                return False

    prov = model_id.split("/")[0] if "/" in model_id else ""
    if prov and not await provider_health.is_provider_available(prov):
        return False

    state = await get_effective_state(model_id)
    if state == "quarantined":
        return False
    if state == "open" or state == "warming":
        return False
    if state == "degraded":
        return allow_degraded
    return True


async def set_quarantined(model_id: str, quarantined: bool) -> None:
    ov = model_overrides.get_override(model_id) or model_overrides.ModelOverride()
    ov.quarantined = quarantined
    model_overrides.set_override(model_id, ov)


async def list_model_snapshots(model_ids: List[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for mid in model_ids:
        out.append(await get_snapshot(mid))
    return out
