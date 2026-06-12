from __future__ import annotations

import json
import logging
import time
from typing import Any, AsyncIterator, Dict, List, Optional

from ai_http import ai_request_url
from orchestration.turn_contract import ResolvedTurn

logger = logging.getLogger(__name__)


def sse_frame(event: str, data: Any) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def build_stream_body(
    *,
    query: str,
    chat_history: List[Dict[str, str]],
    user_id: str,
    resolved_turn: ResolvedTurn,
    stream_task: str,
    attachments: List[Dict[str, Any]],
    resolved_attachments: List[Dict[str, Any]],
    personality_id: Optional[str],
    assistant_display_name: Optional[str],
    system_prompt: Optional[str],
    retrieved_context: Optional[str] = None,
) -> Dict[str, Any]:
    task = resolved_turn.task if resolved_turn.task_locked else stream_task
    return {
        "query": query,
        "rag_enabled": False,
        "retrieved_context": retrieved_context or None,
        "chat_history": chat_history,
        "user_id": user_id,
        "task": task,
        "task_locked": resolved_turn.task_locked,
        "allow_thinking": resolved_turn.allow_thinking,
        "speed_profile": resolved_turn.speed_profile,
        "deadline_ms": resolved_turn.deadline_ms,
        "attachments": attachments,
        "resolved_attachments": resolved_attachments,
        "personality_id": personality_id,
        "assistant_display_name": assistant_display_name,
        "system_prompt": system_prompt,
    }


async def passthrough_chat_stream(
    client: Any,
    body: Dict[str, Any],
    request: Any,
    *,
    turn_t0: float,
    route_intent: str,
    timings: Dict[str, float],
    memory_budget_ms: float,
) -> AsyncIterator[str | bytes]:
    from orchestration.turn_router import memory_prestream_budget_ms

    async with client.stream(
        "POST",
        ai_request_url("/v1/chat/stream"),
        json=body,
    ) as response:
        if response.status_code >= 400:
            err_body = await response.aread()
            snippet = err_body[:500].decode("utf-8", errors="replace")
            logger.error(
                "[agent] ai-runtime error status=%s body=%s",
                response.status_code,
                snippet,
            )
            hint = ""
            if response.status_code == 404:
                hint = (
                    " Start ai-runtime on INTELLIGENCE_UPSTREAM_URL (Tilt: ai-runtime on "
                    ":8000). cognitive-runtime alone does not expose /v1/chat/stream."
                )
            message = (
                f"AI service error ({response.status_code}): "
                f"{snippet[:200] or 'no body'}.{hint}"
            )
            yield sse_frame("error", {"message": message})
            yield sse_frame("done", {})
            return

        first_byte = True
        async for chunk in response.aiter_bytes():
            if await request.is_disconnected():
                await response.aclose()
                break
            if first_byte:
                timings["time_to_first_byte_ms"] = (time.perf_counter() - turn_t0) * 1000
                logger.info(
                    "[agent] first_byte_ms=%.0f intent=%s budget_ms=%.0f rag_ms=%.0f",
                    timings["time_to_first_byte_ms"],
                    route_intent,
                    memory_budget_ms or memory_prestream_budget_ms(),
                    timings.get("rag_ms", 0),
                )
                first_byte = False
            yield chunk
