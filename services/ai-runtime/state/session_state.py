from __future__ import annotations

from typing import Any, Dict, Optional


class SessionState:
    """Ephemeral session-scoped flags and tool results."""

    def __init__(
        self,
        *,
        confirmed: bool = False,
        tool_results: Optional[Dict[str, Any]] = None,
        skip_planning: bool = False,
    ) -> None:
        self.confirmed = confirmed
        self.tool_results = tool_results or {}
        self.skip_planning = skip_planning
