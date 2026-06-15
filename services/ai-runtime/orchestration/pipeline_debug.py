from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def log_agent_stage(stage: str, **extra: Any) -> None:
    if os.getenv("AGENT_TURN_DEBUG_STAGES", "true").strip().lower() not in (
        "1",
        "true",
        "yes",
    ):
        return
    if extra:
        logger.info("[agent] stage=%s %s", stage, extra)
    else:
        logger.info("[agent] stage=%s", stage)
