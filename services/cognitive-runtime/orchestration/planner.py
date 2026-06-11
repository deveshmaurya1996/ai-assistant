
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from orchestration.pipeline import PlanInput, run_planner_pipeline
from orchestration.signals import is_conversational_query, is_likely_tool_query
from orchestration.types import PlanTrace

__all__ = [
    "plan_tools",
    "is_likely_tool_query",
    "is_conversational_query",
]


async def plan_tools(
    query: str,
    context: str,
    user_id: str,
    preferred_model: str | None = None,
    manifest_caps: Optional[Set[str]] = None,
    manifest_connections: Optional[List[Dict[str, Any]]] = None,
    manifest_connection_states: Optional[List[Dict[str, Any]]] = None,
    routing_query: Optional[str] = None,
    timezone: Optional[str] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
    *,
    skip_heuristics: bool = False,
    force_planner: str | None = None,
) -> Dict[str, Any]:
    del preferred_model
    trace = PlanTrace()
    inp = PlanInput(
        query=query,
        context=context,
        user_id=user_id,
        manifest_caps=manifest_caps,
        manifest_connections=manifest_connections,
        manifest_connection_states=manifest_connection_states,
        routing_query=routing_query,
        timezone=timezone,
        chat_history=chat_history,
        skip_heuristics=skip_heuristics,
        force_planner=force_planner,
        trace=trace,
    )
    return await run_planner_pipeline(inp)
