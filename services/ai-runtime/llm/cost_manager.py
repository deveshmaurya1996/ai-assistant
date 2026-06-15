from __future__ import annotations

import os
from typing import Optional


def check_budget(user_id: str, *, estimated_tokens: int = 0) -> Optional[str]:
    """Return error message if user exceeds budget; None if allowed."""
    limit = os.getenv("USER_TOKEN_BUDGET_DAILY", "").strip()
    if not limit:
        return None
    try:
        cap = int(limit)
    except ValueError:
        return None
    if cap <= 0:
        return None
    # Token accounting wired in PR5 when cost tracking lands.
    _ = (user_id, estimated_tokens)
    return None
