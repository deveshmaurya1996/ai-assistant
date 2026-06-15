from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from llm.provider_router import complete_text_orchestrated

logger = logging.getLogger(__name__)
PLANNER_COMPLETE_TIMEOUT = 20.0


async def complete_planner(
    *,
    system: str,
    user_prompt: str,
    user_id: str,
    timeout: float | None = None,
) -> Tuple[str, Optional[str], Dict[str, Any]]:
    _ = timeout
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_prompt},
    ]
    raw, model_used = await complete_text_orchestrated(
        messages, task="planner", allow_thinking=False
    )
    logger.info(
        "[planner_llm] model=%s response_len=%d",
        model_used,
        len(raw),
    )
    return raw, model_used, {"text": raw, "model_used": model_used}
