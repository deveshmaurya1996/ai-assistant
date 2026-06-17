from __future__ import annotations

import json
import logging
import os
import time
from threading import Lock
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_memory: Dict[str, str] = {}
_memory_lock = Lock()
_redis_client: Any = None
_redis_checked = False


def redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://localhost:6379").strip()


def runtime_region() -> str:
    return os.getenv("AI_RUNTIME_REGION", "global").strip() or "global"


def use_redis() -> bool:
    if os.getenv("MODEL_HEALTH_V2", "true").lower() in ("0", "false", "no"):
        return False
    return True


async def get_redis():
    global _redis_client, _redis_checked
    if not use_redis():
        return None
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(
            redis_url(),
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
        )
        await client.ping()
        _redis_client = client
        logger.info("[redis_store] connected to %s", redis_url())
    except Exception as exc:
        logger.warning("[redis_store] Redis unavailable, using in-memory fallback: %s", exc)
        _redis_client = None
    return _redis_client


async def get_json(key: str) -> Optional[Dict[str, Any]]:
    client = await get_redis()
    if client is not None:
        try:
            raw = await client.get(key)
            if not raw:
                return None
            data = json.loads(raw)
            return data if isinstance(data, dict) else None
        except Exception as exc:
            logger.debug("[redis_store] get_json failed key=%s: %s", key, exc)
    with _memory_lock:
        raw = _memory.get(key)
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


async def set_json(key: str, value: Dict[str, Any], *, ttl_seconds: Optional[int] = None) -> None:
    payload = json.dumps(value, separators=(",", ":"))
    client = await get_redis()
    if client is not None:
        try:
            if ttl_seconds:
                await client.setex(key, ttl_seconds, payload)
            else:
                await client.set(key, payload)
            return
        except Exception as exc:
            logger.debug("[redis_store] set_json failed key=%s: %s", key, exc)
    with _memory_lock:
        _memory[key] = payload


async def delete_key(key: str) -> None:
    client = await get_redis()
    if client is not None:
        try:
            await client.delete(key)
        except Exception:
            pass
    with _memory_lock:
        _memory.pop(key, None)


def model_stats_key(model_id: str) -> str:
    return f"model:stats:{model_id}"


def model_circuit_key(model_id: str) -> str:
    return f"model:circuit:{model_id}"


def provider_health_key(provider: str, region: Optional[str] = None) -> str:
    reg = region or runtime_region()
    return f"provider:health:{provider}:{reg}"


def provider_circuit_key(provider: str, region: Optional[str] = None) -> str:
    reg = region or runtime_region()
    return f"provider:circuit:{provider}:{reg}"


def model_rank_key(task: str) -> str:
    return f"model:rank:{task}"


def model_caps_key(model_id: str) -> str:
    return f"model:caps:{model_id}"


def now_ts() -> float:
    return time.time()
