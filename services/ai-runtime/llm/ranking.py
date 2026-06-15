from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from models.config_loader import (
    get_health_monitor_config,
    get_model_cost_class,
    routing_tiers_for_task,
)
from llm import model_health, overrides as model_overrides, redis_store

logger = logging.getLogger(__name__)

_COST_ORDER = {"cheap": 0, "medium": 1, "expensive": 2}


def _cfg() -> Dict[str, Any]:
    return get_health_monitor_config()


def _confidence(sample_count: int) -> float:
    cfg = _cfg()
    full = int(cfg.get("confidenceFullSampleCount", 500))
    return max(0.1, min(1.0, sample_count / full if full else 1.0))


def _latency_score(p95_ms: Optional[float], task: str) -> float:
    if p95_ms is None:
        return 0.5
    from models.config_loader import get_speed_profile, get_task_profile

    profile = dict(get_task_profile(task))
    deadline_ms = float(profile.get("deadlineMs") or 60_000)
    sp = get_speed_profile(task)
    if sp.get("deadlineMs"):
        deadline_ms = float(sp["deadlineMs"])
    if deadline_ms <= 0:
        deadline_ms = 60_000
    return max(0.0, min(1.0, 1.0 - (p95_ms / deadline_ms)))


async def _score_model(model_id: str, task: str) -> Optional[Dict[str, Any]]:
    stats = await model_health.get_stats_1h(model_id)
    state = await model_health.get_effective_state(model_id)
    if state in ("open", "quarantined", "warming"):
        return None

    success_rate = stats.get("successRate1h")
    if success_rate is None:
        success_rate = 0.5
    p95 = stats.get("p95Latency1h")
    latency_score = _latency_score(p95, task)
    uptime_score = float(success_rate)
    raw = 0.45 * float(success_rate) + 0.35 * latency_score + 0.20 * uptime_score
    sample_count = int(stats.get("sampleCount1h") or 0)
    score = raw * _confidence(sample_count)

    return {
        "modelId": model_id,
        "score": score,
        "rawScore": raw,
        "state": state,
        "successRate1h": success_rate,
        "p95Latency1h": p95,
        "sampleCount1h": sample_count,
        "costClass": get_model_cost_class(model_id),
    }


def _cost_tie_break(a: Dict[str, Any], b: Dict[str, Any], epsilon: float) -> int:
    if abs(a["score"] - b["score"]) > epsilon:
        return 0
    ca = _COST_ORDER.get(str(a.get("costClass") or "medium"), 1)
    cb = _COST_ORDER.get(str(b.get("costClass") or "medium"), 1)
    if ca < cb:
        return -1
    if ca > cb:
        return 1
    return 0


async def rank_models_for_task(
    model_ids: List[str],
    task: str,
    *,
    primary_only: bool = False,
) -> List[Dict[str, Any]]:
    scored: List[Dict[str, Any]] = []
    for mid in model_ids:
        row = await _score_model(mid, task)
        if row is None:
            continue
        if primary_only and row["state"] != "healthy":
            continue
        scored.append(row)

    epsilon = float(_cfg().get("scoreTieEpsilon", 0.05))

    def sort_key(row: Dict[str, Any]) -> tuple:
        state_rank = 0 if row["state"] == "healthy" else 1
        return (state_rank, -row["score"], _COST_ORDER.get(str(row.get("costClass") or "medium"), 1))

    scored.sort(key=sort_key)

    if len(scored) >= 2:
        stable: List[Dict[str, Any]] = [scored[0]]
        for candidate in scored[1:]:
            if _cost_tie_break(stable[0], candidate, epsilon) == 0 and candidate["score"] > stable[0]["score"]:
                continue
            stable.append(candidate)
        return stable
    return scored


async def effective_tiers_for_task(
    task: str,
    *,
    needs_tools: bool = False,
    preferred_model_id: Optional[str] = None,
    session_model_id: Optional[str] = None,
) -> Dict[str, List[str]]:
    del needs_tools 
    seed = routing_tiers_for_task(task)
    all_models: List[str] = []
    for tier in ("tier1", "tier2", "tier3"):
        all_models.extend(seed.get(tier) or [])

    await model_overrides.refresh_overrides_from_db()
    for mid, ov in model_overrides.all_overrides().items():
        if ov.force_primary and await model_health.is_available(
            mid, session_model_id=session_model_id, allow_degraded=True
        ):
            return {
                "tier1": [mid],
                "tier2": [m for m in all_models if m != mid][:4],
                "tier3": seed.get("tier3") or [],
            }

    pin = preferred_model_id or session_model_id
    if pin and await model_health.is_available(
        pin, session_model_id=session_model_id, allow_degraded=True
    ):
        rest = [m for m in all_models if m != pin]
        ranked_rest = await rank_models_for_task(rest, task)
        ordered_rest = [r["modelId"] for r in ranked_rest]
        return {
            "tier1": [pin],
            "tier2": ordered_rest[: max(2, len(ordered_rest) // 2)],
            "tier3": ordered_rest[len(ordered_rest) // 2 :] or (seed.get("tier3") or []),
        }

    ranked = await rank_models_for_task(all_models, task, primary_only=False)
    if not ranked:
        return seed

    healthy = [r["modelId"] for r in ranked if r["state"] == "healthy"]
    degraded = [r["modelId"] for r in ranked if r["state"] == "degraded"]
    ordered = healthy + degraded
    if not ordered:
        return seed

    min_samples = int(_cfg().get("minSampleCountForRanking", 50))
    primary = ordered[0]
    primary_stats = next((r for r in ranked if r["modelId"] == primary), None)
    if primary_stats and int(primary_stats.get("sampleCount1h") or 0) < min_samples:
        primary = ordered[min(1, len(ordered) - 1)] if len(ordered) > 1 else primary

    await _maybe_update_rank_primary(task, primary, ranked)

    tier1 = [primary]
    remainder = [m for m in ordered if m != primary]
    tier2 = remainder[: max(2, len(remainder) // 2)]
    tier3 = remainder[len(remainder) // 2 :] or (seed.get("tier3") or [])

    return {"tier1": tier1, "tier2": tier2, "tier3": tier3}


async def _maybe_update_rank_primary(task: str, candidate: str, ranked: List[Dict[str, Any]]) -> None:
    cfg = _cfg()
    key = redis_store.model_rank_key(task)
    existing = await redis_store.get_json(key) or {}
    now = time.time()
    current = existing.get("primary")
    stable_since = float(existing.get("stableSince") or now)
    last_promotion = float(existing.get("lastPromotionAt") or 0)

    if current == candidate:
        await redis_store.set_json(
            key,
            {**existing, "primary": candidate, "stableSince": stable_since, "candidates": [r["modelId"] for r in ranked]},
        )
        return

    if not current:
        await redis_store.set_json(
            key,
            {"primary": candidate, "stableSince": now, "lastPromotionAt": now, "candidates": [r["modelId"] for r in ranked]},
        )
        return

    cur_row = next((r for r in ranked if r["modelId"] == current), None)
    new_row = next((r for r in ranked if r["modelId"] == candidate), None)
    if not new_row:
        return

    if now - stable_since < float(cfg.get("rankingStabilitySeconds", 1800)):
        return
    if now - last_promotion < float(cfg.get("promotionCooldownSeconds", 3600)):
        return

    if cur_row and new_row.get("p95Latency1h") and cur_row.get("p95Latency1h"):
        improvement = float(cfg.get("rankingImprovementRatio", 0.20))
        cur_p95 = float(cur_row["p95Latency1h"])
        new_p95 = float(new_row["p95Latency1h"])
        if new_p95 > cur_p95 * (1.0 - improvement):
            return

    logger.info("[model-rank] task=%s old=%s new=%s reason=hysteresis_pass", task, current, candidate)
    await redis_store.set_json(
        key,
        {"primary": candidate, "stableSince": now, "lastPromotionAt": now, "candidates": [r["modelId"] for r in ranked]},
    )


async def get_rankings(task: str) -> Dict[str, Any]:
    seed = routing_tiers_for_task(task)
    all_models: List[str] = []
    for tier in ("tier1", "tier2", "tier3"):
        all_models.extend(seed.get(tier) or [])
    ranked = await rank_models_for_task(all_models, task)
    effective = await effective_tiers_for_task(task)
    meta = await redis_store.get_json(redis_store.model_rank_key(task)) or {}
    return {
        "task": task,
        "ranked": ranked,
        "effectiveTiers": effective,
        "primary": meta.get("primary"),
        "stableSince": meta.get("stableSince"),
        "lastPromotionAt": meta.get("lastPromotionAt"),
    }
