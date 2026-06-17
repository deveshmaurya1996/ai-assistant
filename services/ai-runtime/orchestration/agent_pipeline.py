from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, List, Optional

from ai_client import ai_http_client, ai_request_url
from orchestration.memory_fetch import fetch_hybrid_memory_block
from orchestration.pipeline_debug import log_agent_stage
from orchestration.speed_router import resolve_speed_profile
from orchestration.stream_chat import build_stream_body, passthrough_chat_stream, sse_frame
from orchestration.turn_contract import ResolvedTurn, build_resolved_turn
from orchestration.intent_classifier import infer_turn_intent
from orchestration.turn_trace import (
    GROUNDING_REFUSAL_MESSAGE,
    INTEGRATION_GUIDANCE_PLANNERS,
    TurnTrace,
    finalize_trace,
    record_turn_trace,
)
from orchestration.turn_router import (
    TurnIntent,
    TurnRoute,
    classify_turn,
    is_direct_stream_route,
    memory_prestream_budget_ms,
    resolve_memory_retrieval,
)

logger = logging.getLogger(__name__)

ORCHESTRATOR_STREAM_TIMEOUT = float(os.getenv("ORCHESTRATOR_STREAM_TIMEOUT", "45"))
MEMORY_STATUS_MESSAGE = os.getenv(
    "MEMORY_STATUS_MESSAGE", "Checking your saved memories…"
)


@dataclass
class PipelineState:
    payload: Any
    request: Any
    turn_t0: float = field(default_factory=time.perf_counter)
    timings: Dict[str, float] = field(default_factory=dict)
    route: Optional[TurnRoute] = None
    resolved_turn: Optional[ResolvedTurn] = None
    retrieve_memory: bool = False
    tool_results: List[Dict[str, Any]] = field(default_factory=list)
    plan: Dict[str, Any] = field(default_factory=lambda: {"tools": [], "connections": [], "warnings": []})
    manifest_text: str = ""
    chat_history: List[Dict[str, str]] = field(default_factory=list)
    abort_after_planner: bool = False
    image_path_handled: bool = False
    turn_trace: Optional[TurnTrace] = None
    intent_plan: Any = None
    tool_retry_done: bool = False


def _attachment_has_vision(a: Dict[str, Any]) -> bool:
    return bool(a.get("imageDataUrl") or a.get("embeddedImageDataUrls"))


def _stage_classify(state: PipelineState) -> None:
    payload = state.payload
    file_ctx = (payload.file_retrieval_context or "").strip()
    state.route = classify_turn(
        query=payload.query,
        routing_query=payload.routing_query,
        chat_history=payload.chat_history,
        confirmed=payload.confirmed,
        skip_planning=payload.skip_planning,
        rag_enabled=payload.rag_enabled,
        attachments=payload.attachments,
        resolved_attachments=payload.resolved_attachments,
        has_file_context=bool(file_ctx),
    )
    state.intent_plan = infer_turn_intent(
        payload.routing_query or payload.query,
        payload.chat_history,
    )
    state.turn_trace = TurnTrace(
        user_id=payload.user_id,
        session_id=getattr(payload, "chat_session_id", "") or "",
        query=payload.query,
        intent=state.intent_plan.primary_intent,
        route_intent=state.route.intent.value,
        abstract_capabilities=list(state.intent_plan.abstract_capabilities),
        entities=dict(state.intent_plan.entities),
        needs_live_data=state.intent_plan.needs_live_data,
    )
    state.timings["intent"] = state.route.intent.value
    state.chat_history = payload.chat_history[: state.route.history_limit]
    log_agent_stage("route_classified", intent=state.route.intent.value)


def _stage_speed_router(state: PipelineState) -> None:
    assert state.route is not None
    speed_profile = resolve_speed_profile(route=state.route, source=state.payload.source)
    state.retrieve_memory = state.route.retrieve_memory
    state.resolved_turn = build_resolved_turn(
        state.route,
        retrieve_memory=state.retrieve_memory,
        speed_profile=speed_profile,
    )
    state.timings["resolved_task"] = state.resolved_turn.task
    state.timings["speed_profile"] = state.resolved_turn.speed_profile
    state.timings["allow_thinking"] = float(state.resolved_turn.allow_thinking)
    state.timings["deadline_ms"] = float(state.resolved_turn.deadline_ms)
    logger.info(
        "[agent] intent=%s speed=%s stream_task=%s retrieve_memory=%s run_planner=%s deadline_ms=%.0f",
        state.route.intent.value,
        state.resolved_turn.speed_profile,
        state.route.stream_task,
        state.retrieve_memory,
        state.route.run_planner and not state.resolved_turn.skip_planner,
        state.resolved_turn.deadline_ms,
    )


async def _stream_immediately(state: PipelineState) -> AsyncIterator[str | bytes]:
    assert state.route is not None and state.resolved_turn is not None
    payload = state.payload
    log_agent_stage("direct_stream", intent=state.route.intent.value)
    body = build_stream_body(
        query=payload.query,
        chat_history=state.chat_history,
        user_id=payload.user_id,
        resolved_turn=state.resolved_turn,
        stream_task=state.route.stream_task,
        attachments=payload.attachments,
        resolved_attachments=payload.resolved_attachments,
        personality_id=payload.personality_id,
        assistant_display_name=payload.assistant_display_name,
        system_prompt=payload.system_prompt,
        preferred_model_id=getattr(payload, "preferred_model_id", None),
        session_model_id=getattr(payload, "session_model_id", None),
        voice_max_sentences=getattr(payload, "voice_max_sentences", None),
    )
    log_agent_stage("stream_start")
    async with ai_http_client(timeout=ORCHESTRATOR_STREAM_TIMEOUT) as client:
        async for chunk in passthrough_chat_stream(
            client,
            body,
            state.request,
            turn_t0=state.turn_t0,
            route_intent=state.route.intent.value,
            timings=state.timings,
            memory_budget_ms=memory_prestream_budget_ms(),
        ):
            yield chunk


async def _handle_image_path(state: PipelineState) -> AsyncIterator[str | bytes]:
    payload = state.payload
    has_images = any(_attachment_has_vision(a) for a in payload.resolved_attachments)
    from orchestration.image_intent import classify_image_intent

    image_intent = None
    if not payload.confirmed:
        image_intent = classify_image_intent(payload.query, has_image_attachment=has_images)
        if image_intent == "image_edit" and not has_images:
            image_intent = None

    if not image_intent:
        return

    state.image_path_handled = True
    assert state.route is not None
    logger.info("[agent] image fast path intent=%s", image_intent)
    yield sse_frame("status", {"message": "__image_generating__"})
    async with ai_http_client(timeout=300.0) as client:
        res = await client.post(
            ai_request_url("/v1/image/from-chat"),
            json={
                "query": payload.query,
                "resolved_attachments": payload.resolved_attachments,
                "width": 1024,
                "height": 1024,
            },
        )
        try:
            data = res.json()
        except Exception:
            data = {"success": False, "error": "Image service returned invalid response."}
        if res.status_code == 200 and data.get("success"):
            caption = str(data.get("caption") or "Here's your image.")
            yield sse_frame("token", {"content": f"{caption}\n"})
            yield sse_frame(
                "image",
                {
                    "imageBase64": data.get("imageBase64"),
                    "mimeType": data.get("mimeType", "image/jpeg"),
                },
            )
            yield sse_frame(
                "done",
                {
                    "model": data.get("modelUsed"),
                    "label": data.get("modelLabel"),
                },
            )
        else:
            msg = str(data.get("error") or "Image generation failed. Please try again later.")
            yield sse_frame("token", {"content": msg})
            yield sse_frame("done", {})


async def _stage_memory_decision(state: PipelineState) -> None:
    assert state.route is not None
    if state.retrieve_memory:
        return
    file_ctx = (state.payload.file_retrieval_context or "").strip()
    state.retrieve_memory = await resolve_memory_retrieval(
        state.route,
        query=state.payload.query,
        rag_enabled=state.payload.rag_enabled,
        has_file_context=bool(file_ctx),
    )
    if state.resolved_turn and state.retrieve_memory != state.resolved_turn.allow_rag:
        speed_profile = resolve_speed_profile(route=state.route, source=state.payload.source)
        state.resolved_turn = build_resolved_turn(
            state.route,
            retrieve_memory=state.retrieve_memory,
            speed_profile=speed_profile,
        )


async def _stage_planner(state: PipelineState) -> AsyncIterator[str | bytes]:
    from context.context_builder import (
        assemble_turn_context,
        build_assistant_identity_block,
        build_context,
        fetch_curated_facts_block,
        fetch_integration_manifest,
    )
    from orchestration.executor import execute_planned_tools
    from orchestration.planner import plan_tools

    assert state.route is not None and state.resolved_turn is not None
    payload = state.payload
    route = state.route
    file_ctx = (payload.file_retrieval_context or "").strip()
    session_ctx = (payload.session_context or "").strip()
    has_attachments = bool(payload.attachments or payload.resolved_attachments)

    if not (route.run_planner and not state.resolved_turn.skip_planner):
        return

    yield sse_frame("status", {"message": "Checking integrations…"})
    t_manifest = time.perf_counter()
    manifest_text, manifest_caps, manifest_connections, manifest_connection_states = (
        await fetch_integration_manifest(payload.user_id)
    )
    state.manifest_text = manifest_text
    state.timings["manifest_ms"] = (time.perf_counter() - t_manifest) * 1000

    if payload.skip_planning:
        return

    rag_block = ""
    if state.retrieve_memory:
        rag_block = await fetch_curated_facts_block(payload.user_id)

    t_ctx = time.perf_counter()
    context_str = await build_context(
        payload.query,
        payload.user_id,
        state.chat_history,
        state.retrieve_memory,
        manifest_text=manifest_text,
        rag_block=rag_block,
    )
    state.timings["build_context_ms"] = (time.perf_counter() - t_ctx) * 1000

    if file_ctx:
        context_str = f"{file_ctx}\n\n{context_str}".strip() if context_str else file_ctx

    t_plan = time.perf_counter()
    state.plan = await plan_tools(
        payload.query,
        context_str,
        payload.user_id,
        manifest_caps=manifest_caps,
        manifest_connections=manifest_connections,
        manifest_connection_states=manifest_connection_states,
        routing_query=payload.routing_query,
        timezone=payload.timezone,
        chat_history=state.chat_history,
    )
    state.timings["plan_tools_ms"] = (time.perf_counter() - t_plan) * 1000
    state.timings["planner"] = state.plan.get("planner", "")
    if state.plan.get("model_used"):
        state.timings["planner_model"] = state.plan.get("model_used")

    from orchestration.types import planner_trace_in_sse

    if planner_trace_in_sse() and state.plan.get("trace"):
        state.timings["planner_trace"] = state.plan.get("trace")

    work_items = state.plan.get("tools") or state.plan.get("capabilities") or []
    if work_items and route.run_tools:
        t_tools = time.perf_counter()
        state.tool_results = await execute_planned_tools(
            work_items,
            user_id=payload.user_id,
            source=payload.source,
            confirmed=payload.confirmed,
            chat_session_id=payload.chat_session_id,
            connections=state.plan.get("connections", []),
        )
        state.timings["execute_tools_ms"] = (time.perf_counter() - t_tools) * 1000
        from orchestration.turn_trace import count_rows_in_tool_results
        from orchestration.capability_engine import resolve_tools

        if (
            state.intent_plan
            and state.intent_plan.needs_live_data
            and count_rows_in_tool_results(state.tool_results) == 0
            and not state.tool_retry_done
        ):
            state.tool_retry_done = True
            yield sse_frame("status", {"message": "Fetching more data…"})
            broader_caps = list(state.intent_plan.abstract_capabilities or [])
            if "search_messages" not in broader_caps:
                broader_caps.append("search_messages")
            retry_items = resolve_tools(
                broader_caps,
                manifest_caps,
                connection_states=manifest_connection_states,
                entities=state.intent_plan.entities,
            )
            if retry_items:
                extra = await execute_planned_tools(
                    retry_items,
                    user_id=payload.user_id,
                    source=payload.source,
                    confirmed=payload.confirmed,
                    chat_session_id=payload.chat_session_id,
                    connections=state.plan.get("connections", []),
                )
                state.tool_results.extend(extra)
                state.timings["execute_tools_retry_ms"] = (
                    (time.perf_counter() - t_tools) * 1000
                )

        pending_confirm = [r for r in state.tool_results if r.get("requiresConfirmation")]
        completed = [r for r in state.tool_results if not r.get("requiresConfirmation")]

        if pending_confirm and not payload.confirmed:
            from orchestration.contacts import enrich_whatsapp_send_to

            enrich_whatsapp_send_to(pending_confirm, completed, payload.query)
            yield sse_frame(
                "action_confirm",
                {
                    "requiresConfirmation": True,
                    "tools": pending_confirm,
                    "warnings": state.plan.get("warnings", []),
                },
            )
            yield sse_frame(
                "done",
                {"intent": route.intent.value, "timings": state.timings},
            )
            state.abort_after_planner = True
            return


async def _stage_full_stream(state: PipelineState) -> AsyncIterator[str | bytes]:
    from context.context_builder import assemble_turn_context, build_assistant_identity_block
    from orchestration.prompt_compression import compress_prompt_if_needed

    assert state.route is not None and state.resolved_turn is not None
    payload = state.payload
    route = state.route
    resolved_turn = state.resolved_turn
    file_ctx = (payload.file_retrieval_context or "").strip()
    session_ctx = (payload.session_context or "").strip()
    has_attachments = bool(payload.attachments or payload.resolved_attachments)
    has_images = any(_attachment_has_vision(a) for a in payload.resolved_attachments)

    identity_block = (
        build_assistant_identity_block(
            payload.assistant_display_name,
            payload.personality_id,
        )
        if route.include_identity
        else None
    )
    cap_file = has_attachments and route.intent == TurnIntent.KNOWLEDGE
    state.timings["session_context_chars"] = float(len(session_ctx))

    memory_block = ""
    if state.retrieve_memory:
        memory_block, status_emitted = await fetch_hybrid_memory_block(
            query=payload.query,
            user_id=payload.user_id,
            skip_episodic=route.skip_episodic,
            timings=state.timings,
            chat_session_id=payload.chat_session_id,
            memory_budget_ms=resolved_turn.memory_budget_ms,
        )
        if status_emitted:
            yield sse_frame("status", {"message": MEMORY_STATUS_MESSAGE})

    log_agent_stage("memory_done")

    context_for_stream = assemble_turn_context(
        session_context=session_ctx or None,
        file_context=file_ctx or None,
        identity_block=identity_block,
        memory_block=memory_block or None,
        cap_file_context=cap_file,
    )

    has_tool_data = bool(state.tool_results)
    planner_label = state.plan.get("planner") or ""
    include_manifest = has_tool_data or planner_label in INTEGRATION_GUIDANCE_PLANNERS

    if include_manifest and state.manifest_text and state.manifest_text.strip():
        manifest_block = state.manifest_text.strip()
        context_for_stream = (
            f"{manifest_block}\n\n{context_for_stream}"
            if context_for_stream
            else manifest_block
        )

    tool_context = ""
    if state.tool_results:
        from orchestration.tool_results import format_tool_results_for_context

        tool_context = format_tool_results_for_context(
            state.tool_results,
            needs_live_data=bool(state.intent_plan and state.intent_plan.needs_live_data),
        )
    elif state.plan.get("planner") == "llm-scheduling-clarification":
        from orchestration.tool_results import format_scheduling_clarification

        tool_context = format_scheduling_clarification(state.plan.get("warnings") or [])
    elif state.plan.get("planner") == "llm-scheduling-empty":
        from orchestration.tool_results import format_scheduling_plan_failure

        tool_context = format_scheduling_plan_failure(state.plan.get("warnings") or [])
    elif state.plan.get("planner") in ("integration-blocked", "integration-unsupported"):
        from orchestration.tool_results import format_integration_guidance

        tool_context = format_integration_guidance(state.plan.get("user_guidance") or "")

    needs_live = bool(state.intent_plan and state.intent_plan.needs_live_data)
    if (
        needs_live
        and not tool_context.strip()
        and planner_label not in INTEGRATION_GUIDANCE_PLANNERS
        and planner_label != "conversational-skip"
    ):
        if state.turn_trace:
            finalize_trace(
                state.turn_trace,
                tool_results=state.tool_results,
                planner=planner_label,
                tool_context=tool_context,
                route_direct_stream=False,
                turn_t0=state.turn_t0,
            )
            state.turn_trace.grounding_gate = "blocked_no_data"
            state.turn_trace.grounded = False
            state.turn_trace.timings = dict(state.timings)
            record_turn_trace(state.turn_trace)
            yield sse_frame("token", {"content": GROUNDING_REFUSAL_MESSAGE})
            yield sse_frame(
                "done",
                {"trace": state.turn_trace.to_sse_dict(), "timings": state.timings},
            )
        return

    stream_query = payload.query + tool_context
    if has_attachments and not stream_query.strip():
        if has_images:
            stream_query = (
                "Describe and analyze the attached file(s), "
                "including any images or scanned pages."
            )
        else:
            stream_query = (
                "Analyze the attached file(s) and summarize the key details, "
                "structure, and important information."
            )

    warnings = state.plan.get("warnings") or []
    if warnings:
        stream_query += "\n\nPlanner warnings:\n" + "\n".join(f"- {w}" for w in warnings)

    chat_history, context_for_stream, compress_timings = await compress_prompt_if_needed(
        chat_history=state.chat_history,
        context_str=context_for_stream,
        tool_context=tool_context,
        user_query=stream_query,
        user_id=payload.user_id,
        task=resolved_turn.task,
        speed_profile=resolved_turn.speed_profile,
        deadline_ms=resolved_turn.deadline_ms,
    )
    state.timings.update(compress_timings)
    log_agent_stage("compression_done")

    body = build_stream_body(
        query=stream_query,
        chat_history=chat_history,
        user_id=payload.user_id,
        resolved_turn=resolved_turn,
        stream_task=route.stream_task,
        attachments=payload.attachments,
        resolved_attachments=payload.resolved_attachments,
        personality_id=payload.personality_id,
        assistant_display_name=payload.assistant_display_name,
        system_prompt=payload.system_prompt,
        retrieved_context=context_for_stream,
        preferred_model_id=getattr(payload, "preferred_model_id", None),
        session_model_id=getattr(payload, "session_model_id", None),
        needs_live_data=needs_live,
        has_tool_context=bool(tool_context.strip()),
        voice_max_sentences=getattr(payload, "voice_max_sentences", None),
    )
    log_agent_stage("stream_start")

    trace_summary = None
    voice_metadata = None
    if getattr(payload, "source", None) == "voice":
        voice_metadata = {
            "stt_provider": "faster-whisper",
            "tts_provider": "piper",
            "voice_profile_id": getattr(payload, "voice_profile_id", None),
            "voice_max_sentences": getattr(payload, "voice_max_sentences", None),
        }
    if state.turn_trace:
        finalize_trace(
            state.turn_trace,
            tool_results=state.tool_results,
            planner=planner_label,
            tool_context=tool_context,
            route_direct_stream=False,
            turn_t0=state.turn_t0,
        )
        state.turn_trace.timings = dict(state.timings)
        trace_summary = state.turn_trace.to_sse_dict()

    t_stream = time.perf_counter()
    async with ai_http_client(timeout=ORCHESTRATOR_STREAM_TIMEOUT) as client:
        async for chunk in passthrough_chat_stream(
            client,
            body,
            state.request,
            turn_t0=state.turn_t0,
            route_intent=route.intent.value,
            timings=state.timings,
            memory_budget_ms=memory_prestream_budget_ms(),
            trace_summary=trace_summary,
            voice_metadata=voice_metadata,
        ):
            yield chunk
    state.timings["stream_total_ms"] = (time.perf_counter() - t_stream) * 1000

    if state.turn_trace:
        state.turn_trace.response_time_ms = (time.perf_counter() - state.turn_t0) * 1000
        state.turn_trace.timings = dict(state.timings)
        record_turn_trace(state.turn_trace)


async def iter_agent_turn_sse(payload: Any, request: Any) -> AsyncIterator[str | bytes]:
    """
    Cognitive agent turn pipeline — single entry for all chat decisions.

    Classify → Speed Router → Direct Stream Check → Memory → Planner → Stream
    """
    yield sse_frame("status", {"message": "__thinking__"})
    log_agent_stage("agent_turn_start")
    log_agent_stage("imports_done")

    state = PipelineState(payload=payload, request=request)
    if payload.tool_results:
        state.tool_results = list(payload.tool_results)

    _stage_classify(state)
    _stage_speed_router(state)

    assert state.route is not None

    async for frame in _handle_image_path(state):
        yield frame
    if state.image_path_handled:
        return

    if is_direct_stream_route(state.route):
        logger.info(
            "[agent] direct_stream intent=%s task=%s",
            state.route.intent.value,
            state.route.stream_task,
        )
        async for chunk in _stream_immediately(state):
            yield chunk
        return

    await _stage_memory_decision(state)

    async for frame in _stage_planner(state):
        yield frame
    if state.abort_after_planner:
        return

    async for chunk in _stage_full_stream(state):
        yield chunk
