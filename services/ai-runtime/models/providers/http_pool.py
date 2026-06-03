"""Shared sync HTTP client for NVIDIA provider calls."""

from __future__ import annotations

from typing import Optional

import httpx

_client: Optional[httpx.Client] = None


def nvidia_sync_client(timeout: float) -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(
            timeout=httpx.Timeout(timeout, connect=10.0),
            limits=httpx.Limits(max_connections=32, max_keepalive_connections=16),
        )
    return _client
