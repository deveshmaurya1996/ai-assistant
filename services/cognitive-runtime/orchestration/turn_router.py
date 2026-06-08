

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from orchestration.context import (
    is_assistant_meta_query,
    is_memory_recall_query,
    is_rag_globally_enabled,
    is_smalltalk_query,
    should_retrieve_rag_context_async,
)
from orchestration.attachment_intent import attachment_turn_needs_tools
from orchestration.image_intent import classify_image_intent
from orchestration.planner import is_likely_tool_query
from orchestration.scheduling_planner import _looks_like_scheduling_query


class TurnIntent(str, Enum):
    CASUAL = "casual"
    MEMORY = "memory"
    KNOWLEDGE = "knowledge"
    TOOL = "tool"
    CONFIRM = "confirm"


@dataclass(frozen=True)
class TurnRoute:
    intent: TurnIntent
    stream_task: str
    retrieve_memory: bool
    run_planner: bool
    run_tools: bool
    include_identity: bool
    history_limit: int
    skip_episodic: bool = False


def _is_short_followup_turn(query: str, chat_history: List[Dict[str, str]]) -> bool:
    """Route brief replies after assistant messages to the planner (LLM decides scheduling)."""
    q = (query or "").strip()
    if not q or not chat_history or len(q) > 150:
        return False
    if is_assistant_meta_query(q):
        return False
    for msg in reversed(chat_history):
        if msg.get("role") == "assistant":
            return bool(str(msg.get("content") or "").strip())
    return False


def _default_history_limit() -> int:
    raw = os.getenv("CHAT_HISTORY_LIMIT", "20")
    try:
        n = int(raw)
        return min(n, 50) if n > 0 else 20
    except ValueError:
        return 20


def _attachment_has_vision(a: Dict[str, Any]) -> bool:
    return bool(a.get("imageDataUrl") or a.get("embeddedImageDataUrls"))


def _attachment_history_limit() -> int:
    raw = os.getenv("ATTACHMENT_HISTORY_LIMIT", "8")
    try:
        n = int(raw)
        return min(max(n, 2), 50) if n > 0 else 8
    except ValueError:
        return 8


def classify_turn(
    *,
    query: str,
    routing_query: Optional[str] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
    confirmed: bool,
    skip_planning: bool,
    rag_enabled: bool,
    attachments: List[Dict[str, Any]],
    resolved_attachments: List[Dict[str, Any]],
    has_file_context: bool,
) -> TurnRoute:
    """Synchronous intent classification; memory retrieval gating resolved async."""
    history_limit = _default_history_limit()
    has_attachments = bool(attachments or resolved_attachments)
    has_images = any(_attachment_has_vision(a) for a in resolved_attachments)
    has_file_content = any(
        a.get("textExcerpt") or a.get("note") for a in resolved_attachments
    )
    q = (query or "").strip()
    route_q = (routing_query or q).strip() or q
    tool_like = is_likely_tool_query(route_q)

    if confirmed:
        return TurnRoute(
            intent=TurnIntent.CONFIRM,
            stream_task="auto",
            retrieve_memory=False,
            run_planner=not skip_planning,
            run_tools=True,
            include_identity=True,
            history_limit=history_limit,
        )

    if has_attachments:
        attach_history = _attachment_history_limit()
        if attachment_turn_needs_tools(route_q):
            stream_task = "file_analysis" if has_images else "auto"
            return TurnRoute(
                intent=TurnIntent.TOOL,
                stream_task=stream_task,
                retrieve_memory=False,
                run_planner=not skip_planning,
                run_tools=True,
                include_identity=True,
                history_limit=attach_history,
            )
        stream_task = "file_analysis" if has_images else (
            "attachment_read" if has_file_content else "file_analysis"
        )
        return TurnRoute(
            intent=TurnIntent.KNOWLEDGE,
            stream_task=stream_task,
            retrieve_memory=False,
            run_planner=False,
            run_tools=False,
            include_identity=True,
            history_limit=attach_history,
            skip_episodic=bool(has_file_context and not is_memory_recall_query(route_q)),
        )

    history = chat_history or []

    if _is_short_followup_turn(route_q, history):
        return TurnRoute(
            intent=TurnIntent.TOOL,
            stream_task="auto",
            retrieve_memory=False,
            run_planner=not skip_planning,
            run_tools=True,
            include_identity=True,
            history_limit=history_limit,
        )

    if _looks_like_scheduling_query(route_q, history):
        return TurnRoute(
            intent=TurnIntent.TOOL,
            stream_task="auto",
            retrieve_memory=False,
            run_planner=not skip_planning,
            run_tools=True,
            include_identity=True,
            history_limit=history_limit,
        )

    if classify_image_intent(q) == "image":
        return TurnRoute(
            intent=TurnIntent.KNOWLEDGE,
            stream_task="auto",
            retrieve_memory=False,
            run_planner=False,
            run_tools=False,
            include_identity=False,
            history_limit=history_limit,
        )

    if is_assistant_meta_query(q) or is_smalltalk_query(q):
        return TurnRoute(
            intent=TurnIntent.CASUAL,
            stream_task="fast_chat",
            retrieve_memory=False,
            run_planner=False,
            run_tools=False,
            include_identity=False,
            history_limit=history_limit,
        )

    if is_memory_recall_query(q):
        return TurnRoute(
            intent=TurnIntent.MEMORY,
            stream_task="fast_chat",
            retrieve_memory=True,
            run_planner=False,
            run_tools=False,
            include_identity=True,
            history_limit=history_limit,
        )

    if tool_like:
        return TurnRoute(
            intent=TurnIntent.TOOL,
            stream_task="auto",
            retrieve_memory=False,
            run_planner=not skip_planning,
            run_tools=True,
            include_identity=True,
            history_limit=history_limit,
        )

    return TurnRoute(
        intent=TurnIntent.CASUAL,
        stream_task="fast_chat",
        retrieve_memory=False,
        run_planner=False,
        run_tools=False,
        include_identity=False,
        history_limit=history_limit,
    )


async def resolve_memory_retrieval(
    route: TurnRoute,
    *,
    query: str,
    rag_enabled: bool,
    has_file_context: bool,
) -> bool:
    """Whether to run layered memory fetch for this turn."""
    if not is_rag_globally_enabled() or not rag_enabled:
        return False
    if route.intent == TurnIntent.MEMORY:
        return True
    if route.intent in (TurnIntent.CASUAL, TurnIntent.CONFIRM):
        return False
    if route.intent == TurnIntent.KNOWLEDGE:
        return await should_retrieve_rag_context_async(
            query, has_file_context=has_file_context
        )
    if route.intent == TurnIntent.TOOL:
        return await should_retrieve_rag_context_async(
            query, has_file_context=has_file_context
        )
    return False


def memory_prestream_budget_ms() -> float:
    raw = os.getenv("MEMORY_PRESTREAM_BUDGET_MS", "300")
    try:
        return max(50.0, float(raw))
    except ValueError:
        return 300.0
