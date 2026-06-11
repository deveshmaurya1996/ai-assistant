from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from ai_http import ai_http_client, ai_request_url

logger = logging.getLogger(__name__)
PLANNER_COMPLETE_TIMEOUT = float(os.getenv("PLANNER_COMPLETE_TIMEOUT", "20"))


def planner_model() -> str | None:
    explicit = os.getenv("PLANNER_MODEL", "").strip()
    if explicit:
        return explicit
    if os.getenv("NVIDIA_API_KEY"):
        return "auto"
    if os.getenv("POLLINATIONS_API_KEY"):
        return "auto"
    return None


async def complete_planner(
    *,
    system: str,
    user_prompt: str,
    user_id: str,
    timeout: float | None = None,
) -> Tuple[str, Optional[str], Dict[str, Any]]:
    model = planner_model()
    if not model:
        raise RuntimeError("No planner model configured")

    async with ai_http_client(timeout=timeout or PLANNER_COMPLETE_TIMEOUT) as client:
        res = await client.post(
            ai_request_url("/v1/chat/complete"),
            json={
                "query": user_prompt,
                "rag_enabled": False,
                "chat_history": [{"role": "system", "content": system}],
                "user_id": user_id,
                "task": "planner",
            },
        )
        res.raise_for_status()
        data = res.json()

    raw = str(data.get("text", "")).strip()
    model_used = data.get("model_used")
    logger.info(
        "[planner_llm] model=%s response_len=%d",
        model_used,
        len(raw),
    )
    return raw, model_used, data
