from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Dict, List

logger = logging.getLogger(__name__)

_subscribers: Dict[str, List[Callable[[str, Dict[str, Any]], None]]] = {}


def subscribe(event: str, handler: Callable[[str, Dict[str, Any]], None]) -> None:
    _subscribers.setdefault(event, []).append(handler)


def emit(event: str, payload: Dict[str, Any] | None = None) -> None:
    data = payload or {}
    for handler in _subscribers.get(event, []):
        try:
            handler(event, data)
        except Exception as exc:
            logger.warning("[events] handler failed event=%s: %s", event, exc)


async def emit_async(event: str, payload: Dict[str, Any] | None = None) -> None:
    data = payload or {}
    for handler in _subscribers.get(event, []):
        try:
            result = handler(event, data)
            if asyncio.iscoroutine(result):
                await result
        except Exception as exc:
            logger.warning("[events] async handler failed event=%s: %s", event, exc)
