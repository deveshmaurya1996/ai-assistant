from __future__ import annotations

from typing import Any, Dict, List, Optional


class ConversationState:
    """Ephemeral per-turn conversation slice."""

    def __init__(
        self,
        *,
        chat_history: Optional[List[Dict[str, Any]]] = None,
        chat_session_id: Optional[str] = None,
    ) -> None:
        self.chat_history = chat_history or []
        self.chat_session_id = chat_session_id
