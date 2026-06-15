from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from llm import model_health, overrides as model_overrides
from llm.health_monitor import run_daily_capability_probes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/models", tags=["admin-models"])


class ModelOverrideBody(BaseModel):
    modelId: str
    enabled: Optional[bool] = None
    forceTier: Optional[int] = None
    forcePrimary: bool = False
    quarantined: bool = False
    maintenanceMode: bool = False
    priority: int = 0
    reason: Optional[str] = None
    expiresAt: Optional[float] = None


@router.get("/overrides")
def list_overrides() -> Dict[str, Any]:
    items = []
    for mid, ov in model_overrides.all_overrides().items():
        items.append(
            {
                "modelId": mid,
                "enabled": ov.enabled,
                "forceTier": ov.force_tier,
                "forcePrimary": ov.force_primary,
                "quarantined": ov.quarantined,
                "maintenanceMode": ov.maintenance_mode,
                "priority": ov.priority,
                "reason": ov.reason,
                "expiresAt": ov.expires_at,
            }
        )
    return {"overrides": items}


@router.post("/overrides")
def upsert_override(body: ModelOverrideBody) -> Dict[str, Any]:
    model_overrides.set_override(
        body.modelId,
        model_overrides.ModelOverride(
            enabled=body.enabled,
            force_tier=body.forceTier,
            force_primary=body.forcePrimary,
            quarantined=body.quarantined,
            maintenance_mode=body.maintenanceMode,
            priority=body.priority,
            reason=body.reason,
            expires_at=body.expiresAt,
        ),
    )
    return {"ok": True, "modelId": body.modelId}


@router.delete("/overrides/{model_id}")
def delete_override(model_id: str) -> Dict[str, Any]:
    model_overrides.clear_override(model_id)
    return {"ok": True, "modelId": model_id}


@router.post("/overrides/{model_id}/quarantine")
async def quarantine_model(model_id: str) -> Dict[str, Any]:
    await model_health.set_quarantined(model_id, True)
    return {"ok": True, "modelId": model_id, "quarantined": True}


_daily_probe_started = False


async def _daily_capability_loop() -> None:
    while True:
        try:
            await run_daily_capability_probes()
        except Exception as exc:
            logger.warning("[cap-probe] daily loop error: %s", exc)
        await asyncio.sleep(86400)


async def start_daily_capability_probes() -> None:
    global _daily_probe_started
    if _daily_probe_started:
        return
    if os.getenv("CAPABILITY_PROBE_ENABLED", "true").lower() not in ("1", "true", "yes"):
        return
    _daily_probe_started = True
    asyncio.create_task(_daily_capability_loop(), name="daily-capability-probes")
    logger.info("[cap-probe] daily capability probe loop scheduled")
