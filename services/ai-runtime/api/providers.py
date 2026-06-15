from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from llm.provider_monitor import circuit_breaker, health_metrics
from llm.provider_router import provider_config
from llm import model_health, provider_health, ranking
from models.config_loader import runtime_router_model_ids
from models.selectable_catalog import build_selectable_models

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
async def providers_health() -> Dict[str, Any]:
    out: Dict[str, Any] = {"providers": {}, "routes": {}}
    for name in ("nvidia", "groq", "pollinations"):
        configured = _provider_configured(name)
        metrics = health_metrics.stats(name, task="fast_chat")
        breaker = circuit_breaker.snapshot(name, task="fast_chat")
        success_rate = metrics.get("success_rate")
        circuit = str(breaker.get("circuit", "closed"))
        redis_snap = await provider_health.get_provider_snapshot(name)
        out["providers"][name] = {
            "status": redis_snap.get("state") or _status_label(
                configured=configured,
                circuit=circuit,
                success_rate=success_rate,
            ),
            "circuit": circuit,
            "configured": configured,
            "latencyMs": metrics.get("avg_latency_ms"),
            "p95LatencyMs": redis_snap.get("p95Latency1h") or metrics.get("p95_latency_ms"),
            "successRate": redis_snap.get("successRate1h") or success_rate,
            "windowSize": metrics.get("sample_size", 0),
            "failuresInWindow": metrics.get("failures_in_window", 0),
            "failureRate": breaker.get("failure_rate"),
            "sampleCount1h": redis_snap.get("sampleCount1h"),
        }
    for key in health_metrics.route_keys():
        provider, task = key.split(":", 1)
        out["routes"][key] = health_metrics.stats(
            provider, task=None if task == "*" else task
        )
    return out


@router.get("/models/health")
async def models_health() -> Dict[str, Any]:
    ids = runtime_router_model_ids()
    snapshots = await model_health.list_model_snapshots(ids)
    return {"models": snapshots, "count": len(snapshots)}


@router.get("/models/rankings")
async def models_rankings(task: str = Query("fast_chat")) -> Dict[str, Any]:
    return await ranking.get_rankings(task)


@router.get("/models/selectable")
async def models_selectable(task: str = Query("fast_chat")) -> Dict[str, Any]:
    """Priority-ordered selectable models with Redis health and ranking."""
    return await build_selectable_models(task)


@router.get("/models/stats")
async def models_stats(modelId: str = Query(..., alias="modelId")) -> Dict[str, Any]:
    stats = await model_health.get_stats_1h(modelId)
    state = await model_health.get_effective_state(modelId)
    return {"modelId": modelId, "state": state, **stats}
