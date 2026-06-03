"""LRU cache for query embeddings (reduces repeated NVIDIA embed latency)."""

from __future__ import annotations

import time
from collections import OrderedDict
from threading import Lock
from typing import List, Optional, Tuple

from models.config_loader import get_rag_config

_lock = Lock()
_cache: OrderedDict[str, Tuple[List[float], float]] = OrderedDict()
_hits = 0
_misses = 0


def _normalize_query(query: str) -> str:
    return " ".join((query or "").strip().lower().split())


def _cache_key(user_id: Optional[str], query: str) -> str:
    uid = (user_id or "").strip()
    return f"{uid}\0{_normalize_query(query)}"


def _limits() -> Tuple[int, float]:
    cfg = get_rag_config()
    max_entries = int(cfg.get("embeddingCacheMaxEntries", 256))
    ttl = float(cfg.get("embeddingCacheTtlSeconds", 60))
    return max(32, max_entries), max(5.0, ttl)


def get_cached_embedding(
    user_id: Optional[str], query: str
) -> Optional[List[float]]:
    global _hits, _misses
    key = _cache_key(user_id, query)
    now = time.monotonic()
    _, ttl = _limits()
    with _lock:
        entry = _cache.get(key)
        if not entry:
            _misses += 1
            return None
        vector, expires = entry
        if expires < now:
            del _cache[key]
            _misses += 1
            return None
        _cache.move_to_end(key)
        _hits += 1
        return list(vector)


def set_cached_embedding(
    user_id: Optional[str], query: str, vector: List[float]
) -> None:
    key = _cache_key(user_id, query)
    max_entries, ttl = _limits()
    expires = time.monotonic() + ttl
    with _lock:
        _cache[key] = (list(vector), expires)
        _cache.move_to_end(key)
        while len(_cache) > max_entries:
            _cache.popitem(last=False)


def cache_stats() -> dict:
    with _lock:
        return {"entries": len(_cache), "hits": _hits, "misses": _misses}
