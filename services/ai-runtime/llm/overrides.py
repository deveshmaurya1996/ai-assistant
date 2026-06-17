from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class ModelOverride:
    enabled: Optional[bool] = None
    force_tier: Optional[int] = None
    force_primary: bool = False
    quarantined: bool = False
    maintenance_mode: bool = False
    priority: int = 0
    reason: Optional[str] = None
    expires_at: Optional[float] = None


_overrides: Dict[str, ModelOverride] = {}
_cache_loaded_at: float = 0.0
_CACHE_TTL = 60.0


def set_override(model_id: str, override: ModelOverride) -> None:
    _overrides[model_id] = override


def clear_override(model_id: str) -> None:
    _overrides.pop(model_id, None)


def get_override(model_id: str) -> Optional[ModelOverride]:
    ov = _overrides.get(model_id)
    if ov is None:
        return None
    if ov.expires_at is not None and time.time() > ov.expires_at:
        _overrides.pop(model_id, None)
        return None
    return ov


def all_overrides() -> Dict[str, ModelOverride]:
    now = time.time()
    expired = [mid for mid, ov in _overrides.items() if ov.expires_at and now > ov.expires_at]
    for mid in expired:
        _overrides.pop(mid, None)
    return dict(_overrides)


async def refresh_overrides_from_db() -> None:
    """Load Postgres overrides when available (PR1). No-op if DB not configured."""
    global _cache_loaded_at
    if time.time() - _cache_loaded_at < _CACHE_TTL:
        return
    _cache_loaded_at = time.time()
    db_url = __import__("os").environ.get("DATABASE_URL", "").strip()
    if not db_url:
        return
    try:
        import asyncio

        rows = await asyncio.to_thread(_load_overrides_sync, db_url)
        for row in rows:
            model_id = str(row.get("modelId") or "")
            if not model_id:
                continue
            expires = row.get("expiresAt")
            expires_at = expires.timestamp() if expires is not None else None
            set_override(
                model_id,
                ModelOverride(
                    enabled=row.get("enabled"),
                    force_tier=row.get("forceTier"),
                    force_primary=bool(row.get("forcePrimary")),
                    quarantined=bool(row.get("quarantined")),
                    maintenance_mode=bool(row.get("maintenanceMode")),
                    priority=int(row.get("priority") or 0),
                    reason=row.get("reason"),
                    expires_at=expires_at,
                ),
            )
    except Exception:
        pass


def _load_overrides_sync(db_url: str) -> list:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        return []

    with psycopg.connect(db_url, row_factory=dict_row, connect_timeout=2) as conn:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT "modelId", enabled, "forceTier", "forcePrimary",
                       quarantined, "maintenanceMode", priority, reason, "expiresAt"
                FROM "ModelRuntimeOverride"
                '''
            )
            return list(cur.fetchall())
