from __future__ import annotations

from typing import Any, Dict, List

from models.config_loader import (
    get_model_cost_class,
    get_model_ui,
    list_model_defs,
    router_eligible,
    user_selectable,
)
from models.model_resolver import label_for, model_is_available
from llm import model_health, ranking, redis_store


async def build_selectable_models(task: str = "fast_chat") -> Dict[str, Any]:
    candidates: List[str] = []
    entry_by_id: Dict[str, Dict[str, Any]] = {}
    for entry in list_model_defs():
        mid = str(entry.get("id") or "")
        if not mid:
            continue
        if not user_selectable(mid):
            continue
        candidates.append(mid)
        entry_by_id[mid] = entry

    ranked = await ranking.rank_models_for_task(candidates, task)
    ranked_ids = [r["modelId"] for r in ranked]
    tail = [mid for mid in candidates if mid not in ranked_ids]
    order = ranked_ids + tail

    rank_meta = await redis_store.get_json(redis_store.model_rank_key(task)) or {}
    recommended = rank_meta.get("primary") or (ranked[0]["modelId"] if ranked else None)

    models: List[Dict[str, Any]] = []
    routing_order: List[str] = []

    for priority, mid in enumerate(order, start=1):
        entry = entry_by_id.get(mid, {})
        configured = model_is_available(mid)
        operational = await model_health.is_available(mid, allow_degraded=True)
        available = configured and operational
        state = await model_health.get_effective_state(mid)
        stats = await model_health.get_stats_1h(mid)
        row = next((r for r in ranked if r["modelId"] == mid), None)

        if available:
            routing_order.append(mid)

        models.append(
            {
                "id": mid,
                "label": str(entry.get("label") or label_for(mid)),
                "provider": entry.get("provider"),
                "tasks": entry.get("tasks") or [],
                "priority": priority,
                "rankScore": round(float(row["score"]), 4) if row else None,
                "state": state,
                "configured": configured,
                "operational": operational,
                "available": available,
                "recommended": mid == recommended,
                "routerEligible": router_eligible(mid),
                "costClass": get_model_cost_class(mid),
                "ui": get_model_ui(mid),
                "successRate1h": stats.get("successRate1h"),
                "p95Latency1h": stats.get("p95Latency1h"),
                "sampleCount1h": stats.get("sampleCount1h"),
            }
        )

    return {
        "task": task,
        "mode": "auto",
        "recommendedModelId": recommended,
        "primaryFromRedis": rank_meta.get("primary"),
        "models": models,
        "routingOrder": routing_order,
        "updatedAt": rank_meta.get("stableSince"),
    }
