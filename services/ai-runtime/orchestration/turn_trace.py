

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

INTEGRATION_GUIDANCE_PLANNERS = frozenset(
    {
        "connected-apps-info",
        "integration-blocked",
        "integration-unsupported",
        "llm-scheduling-clarification",
        "llm-scheduling-empty",
    }
)

GROUNDING_REFUSAL_MESSAGE = (
    "I couldn't retrieve your messages, calendar, or files for that question. "
    "Please open Connect Apps and make sure the relevant app is linked and active, "
    "then try again."
)


@dataclass
class TurnTrace:
    turn_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    session_id: str = ""
    query: str = ""
    intent: str = "conversational"
    route_intent: str = ""
    planner: str = ""
    abstract_capabilities: List[str] = field(default_factory=list)
    entities: Dict[str, Any] = field(default_factory=dict)
    tools: List[str] = field(default_factory=list)
    tools_executed: int = 0
    rows_retrieved: int = 0
    retrieval_source: str = ""
    grounded: bool = False
    grounding_gate: str = ""
    needs_live_data: bool = False
    response_time_ms: float = 0.0
    timings: Dict[str, float] = field(default_factory=dict)
    tool_errors: List[str] = field(default_factory=list)

    def to_log_dict(self) -> Dict[str, Any]:
        return {
            "turnId": self.turn_id,
            "userId": self.user_id,
            "sessionId": self.session_id,
            "query": self.query[:500],
            "intent": self.intent,
            "routeIntent": self.route_intent,
            "planner": self.planner,
            "abstractCapabilities": self.abstract_capabilities,
            "entities": self.entities,
            "tools": self.tools,
            "toolsExecuted": self.tools_executed,
            "rowsRetrieved": self.rows_retrieved,
            "retrievalSource": self.retrieval_source,
            "grounded": self.grounded,
            "groundingGate": self.grounding_gate,
            "needsLiveData": self.needs_live_data,
            "responseTimeMs": round(self.response_time_ms, 1),
            "timings": {k: round(v, 1) for k, v in self.timings.items()},
            "toolErrors": self.tool_errors[:5],
        }

    def to_sse_dict(self) -> Dict[str, Any]:
        d = self.to_log_dict()
        return {k: v for k, v in d.items() if k not in ("query",)}


_RECENT_TURNS: Dict[str, List[Dict[str, Any]]] = {}
_MAX_RECENT_PER_USER = 50


def record_turn_trace(trace: TurnTrace) -> None:
    payload = trace.to_log_dict()
    logger.info("[turn_trace] %s", json.dumps(payload, ensure_ascii=False))
    uid = trace.user_id
    if uid:
        rows = _RECENT_TURNS.setdefault(uid, [])
        rows.insert(0, payload)
        del rows[_MAX_RECENT_PER_USER:]


def get_recent_turn_traces(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    return list(_RECENT_TURNS.get(user_id, [])[:limit])


def count_rows_in_tool_results(tool_results: List[Dict[str, Any]]) -> int:
    total = 0
    for entry in tool_results:
        if entry.get("requiresConfirmation"):
            continue
        if entry.get("error"):
            continue
        result = entry.get("result")
        if result is None:
            continue
        if isinstance(result, dict):
            data = result.get("data", result)
            if isinstance(data, dict):
                for key in ("items", "messages", "events", "files", "chats", "emails"):
                    val = data.get(key)
                    if isinstance(val, list):
                        total += len(val)
                        break
                else:
                    if data.get("type") and (
                        data.get("body")
                        or data.get("text")
                        or data.get("title")
                        or data.get("preview")
                    ):
                        total += 1
            elif isinstance(data, list):
                total += len(data)
        elif isinstance(result, list):
            total += len(result)
    return total


def infer_retrieval_source(tool_results: List[Dict[str, Any]]) -> str:
    tools = [str(e.get("tool") or "") for e in tool_results]
    if any("search_messages" in t for t in tools):
        return "db"
    if any(t.startswith(("email.", "calendar.", "drive.", "messaging.", "whatsapp.")) for t in tools):
        return "live"
    return ""


def compute_grounded(
    *,
    needs_live_data: bool,
    rows_retrieved: int,
    planner: str,
    tool_context: str,
    route_direct_stream: bool,
) -> tuple[bool, str]:
    if route_direct_stream and needs_live_data:
        return False, "skipped_direct_stream"
    if planner in INTEGRATION_GUIDANCE_PLANNERS:
        return True, "integration_guidance"
    if not needs_live_data:
        return True, "not_required"
    if rows_retrieved > 0 or bool(tool_context.strip()):
        return True, "passed"
    return False, "blocked_no_data"


def finalize_trace(
    trace: TurnTrace,
    *,
    tool_results: List[Dict[str, Any]],
    planner: str,
    tool_context: str,
    route_direct_stream: bool,
    turn_t0: float,
) -> TurnTrace:
    trace.planner = planner
    trace.tools = [
        str(e.get("tool") or e.get("capability") or "")
        for e in (tool_results or [])
        if e.get("tool") or e.get("capability")
    ]
    trace.tools_executed = len(
        [e for e in tool_results if not e.get("requiresConfirmation")]
    )
    trace.rows_retrieved = count_rows_in_tool_results(tool_results)
    trace.retrieval_source = infer_retrieval_source(tool_results)
    trace.tool_errors = [
        str(e.get("error"))
        for e in tool_results
        if e.get("error")
    ]
    trace.response_time_ms = (time.perf_counter() - turn_t0) * 1000
    grounded, gate = compute_grounded(
        needs_live_data=trace.needs_live_data,
        rows_retrieved=trace.rows_retrieved,
        planner=planner,
        tool_context=tool_context,
        route_direct_stream=route_direct_stream,
    )
    trace.grounded = grounded
    trace.grounding_gate = gate
    return trace
