from __future__ import annotations

import json
import logging
import time
from typing import Any, AsyncIterator, Dict, List, Optional

from ai_client import ai_request_url
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
    preferred_model_id: Optional[str] = None,
    session_model_id: Optional[str] = None,
    needs_live_data: bool = False,
    has_tool_context: bool = False,
    voice_profile_id: Optional[str] = None,
    voice_max_sentences: Optional[int] = None,
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
        "preferred_model_id": preferred_model_id,
        "session_model_id": session_model_id,
        "needs_live_data": needs_live_data,
        "has_tool_context": has_tool_context,
        "voice_max_sentences": voice_max_sentences,
    }


def _augment_done_frames(
    text: str,
    trace_summary: Optional[Dict[str, Any]],
    timings: Dict[str, float],
    voice_metadata: Optional[Dict[str, Any]] = None,
) -> str:
    if not trace_summary or "event: done" not in text:
        return text
    parts = text.split("\n\n")
    out: List[str] = []
    for part in parts:
        if not part.strip():
            continue
        if part.startswith("event: done"):
            lines = part.split("\n")
            data_line = next((ln for ln in lines if ln.startswith("data: ")), None)
            payload: Dict[str, Any] = {}
            if data_line:
                try:
                    payload = json.loads(data_line[6:])
                except json.JSONDecodeError:
                    payload = {}
            payload["trace"] = trace_summary
            payload["timings"] = {k: round(v, 1) for k, v in timings.items()}
            if voice_metadata:
                payload["voice_metadata"] = voice_metadata
            out.append(f"event: done\ndata: {json.dumps(payload, ensure_ascii=False)}")
        else:
            out.append(part)
    return "\n\n".join(out) + ("\n\n" if text.endswith("\n\n") else "")


async def passthrough_chat_stream(
    client: Any,
    body: Dict[str, Any],
    request: Any,
    *,
    turn_t0: float,
    route_intent: str,
    timings: Dict[str, float],
    memory_budget_ms: float,
    trace_summary: Optional[Dict[str, Any]] = None,
    voice_metadata: Optional[Dict[str, Any]] = None,
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
                    ":8000). Start ai-runtime (pnpm dev:ai-runtime), not a partial stack."
                )
            message = (
                f"AI service error ({response.status_code}): "
                f"{snippet[:200] or 'no body'}.{hint}"
            )
            yield sse_frame("error", {"message": message})
            yield sse_frame("done", {})
            return

        first_byte = True
        sse_buffer = ""
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
            if trace_summary:
                sse_buffer += chunk.decode("utf-8", errors="replace")
                while "\n\n" in sse_buffer:
                    block, sse_buffer = sse_buffer.split("\n\n", 1)
                    augmented = _augment_done_frames(
                        block, trace_summary, timings, voice_metadata
                    ).rstrip("\n")
                    if augmented:
                        yield augmented + "\n\n"
                continue
            yield chunk
        if trace_summary and sse_buffer.strip():
            augmented = _augment_done_frames(
                sse_buffer, trace_summary, timings, voice_metadata
            )
            if augmented.strip():
                yield augmented if augmented.endswith("\n\n") else augmented + "\n\n"
