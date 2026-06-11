
import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

app = FastAPI(title="Cognitive Runtime", version="1.0.0")

from ai_http import AI_SERVICE_URL, ai_http_client, ai_request_url
from cognitive_env_loader import (
    load_service_env,
    resolve_capability_runtime_url,
    resolve_public_api_url,
    resolve_tool_runtime_url,
)

load_service_env()
GATEWAY_URL = resolve_public_api_url()
TOOL_RUNTIME_URL = resolve_tool_runtime_url()
CAPABILITY_RUNTIME_URL = resolve_capability_runtime_url()
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")

MEMORY_STATUS_MESSAGE = os.getenv(
    "MEMORY_STATUS_MESSAGE", "Checking your saved memories…"
)


def _sse_frame(event: str, data: Any) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


class AgentTurnRequest(BaseModel):
    query: str
    routing_query: Optional[str] = None
    user_id: str
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    chat_session_id: Optional[str] = None
    source: str = "chat"
    rag_enabled: bool = True
    confirmed: bool = False
    tool_results: Optional[List[Dict[str, Any]]] = None
    skip_planning: bool = False
    attachments: List[Dict[str, Any]] = Field(default_factory=list)
    resolved_attachments: List[Dict[str, Any]] = Field(default_factory=list)
    personality_id: Optional[str] = None
    assistant_display_name: Optional[str] = None
    system_prompt: Optional[str] = None
    file_retrieval_context: Optional[str] = None
    session_context: Optional[str] = None
    timezone: Optional[str] = None


class ToolCallRequest(BaseModel):
    user_id: str
    tool: str
    args: Dict[str, Any]
    source: str = "chat"
    confirmed: bool = False
    preview: bool = False
    chat_session_id: Optional[str] = None


async def _probe(
    url: str,
    path: str,
    params: Optional[Dict] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(
                f"{url}{path}", params=params or {}, headers=headers or {}
            )
            return {"ok": res.status_code < 400, "status": res.status_code}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.get("/health")
def health():
    embedded = os.getenv("COGNITIVE_EMBEDDED", "").strip().lower() in ("1", "true", "yes")
    if embedded:
        return {"status": "ok", "service": "intelligence", "ai": True, "cognitive": True}
    return {
        "status": "degraded",
        "service": "cognitive-runtime",
        "ai": False,
        "cognitive": True,
        "hint": "Start ai-runtime (pnpm dev:ai-runtime), not cognitive-runtime alone",
    }


@app.middleware("http")
async def internal_auth_middleware(request: Request, call_next):
    if "/internal/" in request.url.path:
        header = request.headers.get("x-internal-token")
        if header != INTERNAL_SERVICE_TOKEN:
            return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return await call_next(request)


class ManifestInvalidateRequest(BaseModel):
    userId: str


@app.post("/internal/integrations/manifest/invalidate")
async def invalidate_manifest(body: ManifestInvalidateRequest):
    from orchestration.context import invalidate_integration_manifest

    user_id = body.userId.strip()
    if not user_id:
        return JSONResponse(status_code=400, content={"error": "userId is required"})
    invalidate_integration_manifest(user_id)
    return {"ok": True}


@app.get("/v1/tools/available")
async def tools_available(user_id: str | None = None):
    async with httpx.AsyncClient() as client:
        params = {"userId": user_id} if user_id else {}
        res = await client.get(f"{TOOL_RUNTIME_URL}/v1/tools/available", params=params)
        res.raise_for_status()
        return res.json()


@app.get("/v1/agent/diagnostics")
async def agent_diagnostics(user_id: str):
    from orchestration.context import fetch_integration_manifest

    manifest_text, manifest_caps, connections, _ = await fetch_integration_manifest(user_id)
    headers = {"X-Internal-Token": INTERNAL_SERVICE_TOKEN}

    gateway_manifest = await _probe(
        GATEWAY_URL,
        "/internal/integrations/manifest",
        {"userId": user_id},
        {"X-Internal-Token": INTERNAL_SERVICE_TOKEN},
    )
    capability_manifest = await _probe(
        CAPABILITY_RUNTIME_URL,
        "/v1/integrations/manifest",
        {"userId": user_id},
    )
    tool_runtime = await _probe(TOOL_RUNTIME_URL, "/health")
    capability_runtime = await _probe(CAPABILITY_RUNTIME_URL, "/health")
    ai_runtime = await _probe(AI_SERVICE_URL, "/health")

    return {
        "userId": user_id,
        "connections": connections,
        "manifestCapabilityCount": len(manifest_caps),
        "manifestPreview": manifest_text[:500] if manifest_text else "",
        "probes": {
            "gatewayManifest": gateway_manifest,
            "capabilityManifest": capability_manifest,
            "toolRuntime": tool_runtime,
            "capabilityRuntime": capability_runtime,
            "aiRuntime": ai_runtime,
        },
    }


@app.get("/v1/agent/diagnostics/timing")
async def agent_diagnostics_timing(user_id: str, query: str = "hello"):
    """Smoke-test path timings by intent."""
    from orchestration.context import fetch_rag_context, fetch_integration_manifest
    from orchestration.turn_router import TurnIntent, classify_turn

    route = classify_turn(
        query=query,
        confirmed=False,
        skip_planning=False,
        rag_enabled=True,
        attachments=[],
        resolved_attachments=[],
        has_file_context=False,
    )
    timings: Dict[str, float] = {}

    t0 = time.perf_counter()
    manifest_text, _, _, _ = await fetch_integration_manifest(user_id)
    timings["manifest_ms"] = (time.perf_counter() - t0) * 1000

    t1 = time.perf_counter()
    await fetch_rag_context(query, user_id)
    timings["rag_ms"] = (time.perf_counter() - t1) * 1000

    return {
        "query": query,
        "intent": route.intent.value,
        "timings": timings,
        "manifest_chars": len(manifest_text),
        "run_planner": route.run_planner,
        "retrieve_memory": route.retrieve_memory,
    }


@app.post("/v1/tools/execute")
async def execute_tool(payload: ToolCallRequest):
    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(
            f"{TOOL_RUNTIME_URL}/v1/executions",
            json=payload.model_dump(),
        )
        if res.status_code == 428:
            return {"requiresConfirmation": True, "error": res.json()}
        res.raise_for_status()
        return res.json()


async def _hybrid_memory_block(
    *,
    query: str,
    user_id: str,
    skip_episodic: bool,
    timings: Dict[str, float],
    chat_session_id: Optional[str] = None,
) -> tuple[str, bool]:
    """Wait up to budget for memory; return (block, status_emitted)."""
    from orchestration.context import fetch_layered_memory_context
    from orchestration.turn_router import memory_prestream_budget_ms

    budget_s = memory_prestream_budget_ms() / 1000.0
    t0 = time.perf_counter()
    task = asyncio.create_task(
        fetch_layered_memory_context(
            query,
            user_id,
            skip_episodic=skip_episodic,
            chat_session_id=chat_session_id,
        )
    )
    status_emitted = False
    try:
        block = await asyncio.wait_for(asyncio.shield(task), timeout=budget_s)
        timings["rag_ms"] = (time.perf_counter() - t0) * 1000
        timings["rag_within_budget"] = 1.0
        return block, status_emitted
    except asyncio.TimeoutError:
        status_emitted = True
        timings["rag_within_budget"] = 0.0
        try:
            block = await task
            timings["rag_ms"] = (time.perf_counter() - t0) * 1000
            return block, status_emitted
        except Exception as exc:
            logger.warning("[agent] memory fetch failed after status: %s", exc)
            timings["rag_ms"] = (time.perf_counter() - t0) * 1000
            return "", status_emitted


ORCHESTRATOR_STREAM_TIMEOUT = float(os.getenv("ORCHESTRATOR_STREAM_TIMEOUT", "45"))


@app.post("/v1/agent/turn")
async def agent_turn(payload: AgentTurnRequest, request: Request):
    from orchestration.planner import plan_tools
    from orchestration.executor import execute_planned_tools
    from orchestration.context import (
        assemble_turn_context,
        build_assistant_identity_block,
        build_context,
        fetch_curated_facts_block,
        fetch_integration_manifest,
    )
    from orchestration.turn_router import (
        TurnIntent,
        classify_turn,
        memory_prestream_budget_ms,
        resolve_memory_retrieval,
    )

    turn_t0 = time.perf_counter()
    timings: Dict[str, float] = {}

    tool_results: List[Dict[str, Any]] = list(payload.tool_results or [])
    plan: Dict[str, Any] = {"tools": [], "connections": [], "warnings": []}
    manifest_text = ""

    has_attachments = bool(payload.attachments or payload.resolved_attachments)

    def _attachment_has_vision(a: Dict[str, Any]) -> bool:
        return bool(a.get("imageDataUrl") or a.get("embeddedImageDataUrls"))

    has_images = any(_attachment_has_vision(a) for a in payload.resolved_attachments)
    file_ctx = (payload.file_retrieval_context or "").strip()
    session_ctx = (payload.session_context or "").strip()

    route = classify_turn(
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
    timings["intent"] = route.intent.value  # type: ignore[assignment]

    retrieve_memory = route.retrieve_memory
    if not retrieve_memory:
        retrieve_memory = await resolve_memory_retrieval(
            route,
            query=payload.query,
            rag_enabled=payload.rag_enabled,
            has_file_context=bool(file_ctx),
        )

    identity_block = (
        build_assistant_identity_block(
            payload.assistant_display_name,
            payload.personality_id,
        )
        if route.include_identity
        else None
    )

    cap_file = has_attachments and route.intent == TurnIntent.KNOWLEDGE
    base_context = assemble_turn_context(
        session_context=session_ctx or None,
        file_context=file_ctx or None,
        identity_block=identity_block,
        memory_block=None,
        cap_file_context=cap_file,
    )

    logger.info(
        "[agent] intent=%s stream_task=%s retrieve_memory=%s run_planner=%s",
        route.intent.value,
        route.stream_task,
        retrieve_memory,
        route.run_planner,
    )

    from orchestration.image_intent import classify_image_intent

    image_intent = None
    if not payload.confirmed:
        image_intent = classify_image_intent(
            payload.query, has_image_attachment=has_images
        )
        if image_intent == "image_edit" and not has_images:
            image_intent = None

    if image_intent:

        async def image_stream():
            logger.info("[agent] image fast path intent=%s", image_intent)
            yield _sse_frame("status", {"message": "__image_generating__"})
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
                    yield _sse_frame("token", {"content": f"{caption}\n"})
                    yield _sse_frame(
                        "image",
                        {
                            "imageBase64": data.get("imageBase64"),
                            "mimeType": data.get("mimeType", "image/jpeg"),
                        },
                    )
                    yield _sse_frame(
                        "done",
                        {
                            "model": data.get("modelUsed"),
                            "label": data.get("modelLabel"),
                        },
                    )
                else:
                    msg = str(
                        data.get("error")
                        or "Image generation failed. Please try again later."
                    )
                    yield _sse_frame("token", {"content": msg})
                    yield _sse_frame("done", {})

        return StreamingResponse(image_stream(), media_type="text/event-stream")

    stream_task = route.stream_task

    use_hybrid_memory = retrieve_memory
    hybrid_skip_episodic = route.skip_episodic
    prebuilt_context = base_context
    timings["session_context_chars"] = float(len(session_ctx))
    chat_history = payload.chat_history[: route.history_limit]

    async def stream_response():
        nonlocal plan, tool_results, manifest_text
        t_stream = time.perf_counter()
        rag_block = ""
        yield _sse_frame("status", {"message": "__thinking__"})

        if route.run_planner:
            yield _sse_frame("status", {"message": "Checking integrations…"})
            t_manifest = time.perf_counter()
            manifest_text, manifest_caps, manifest_connections, manifest_connection_states = (
                await fetch_integration_manifest(payload.user_id)
            )
            timings["manifest_ms"] = (time.perf_counter() - t_manifest) * 1000

            if not payload.skip_planning:
                if retrieve_memory:
                    rag_block = await fetch_curated_facts_block(payload.user_id)

                t_ctx = time.perf_counter()
                context_str = await build_context(
                    payload.query,
                    payload.user_id,
                    chat_history,
                    retrieve_memory,
                    manifest_text=manifest_text,
                    rag_block=rag_block,
                )
                timings["build_context_ms"] = (time.perf_counter() - t_ctx) * 1000

                if file_ctx:
                    context_str = (
                        f"{file_ctx}\n\n{context_str}".strip() if context_str else file_ctx
                    )

                t_plan = time.perf_counter()
                plan = await plan_tools(
                    payload.query,
                    context_str,
                    payload.user_id,
                    manifest_caps=manifest_caps,
                    manifest_connections=manifest_connections,
                    manifest_connection_states=manifest_connection_states,
                    routing_query=payload.routing_query,
                    timezone=payload.timezone,
                    chat_history=chat_history,
                )
                timings["plan_tools_ms"] = (time.perf_counter() - t_plan) * 1000
                timings["planner"] = plan.get("planner", "")
                if plan.get("model_used"):
                    timings["planner_model"] = plan.get("model_used")
                from orchestration.types import planner_trace_in_sse

                if planner_trace_in_sse() and plan.get("trace"):
                    timings["planner_trace"] = plan.get("trace")

                work_items = plan.get("tools") or plan.get("capabilities") or []
                if work_items and route.run_tools:
                    t_tools = time.perf_counter()
                    tool_results = await execute_planned_tools(
                        work_items,
                        user_id=payload.user_id,
                        source=payload.source,
                        confirmed=payload.confirmed,
                        chat_session_id=payload.chat_session_id,
                        connections=plan.get("connections", []),
                    )
                    timings["execute_tools_ms"] = (time.perf_counter() - t_tools) * 1000
                    pending_confirm = [
                        r for r in tool_results if r.get("requiresConfirmation")
                    ]
                    completed = [
                        r for r in tool_results if not r.get("requiresConfirmation")
                    ]

                    if pending_confirm and not payload.confirmed:
                        from orchestration.contacts import enrich_whatsapp_send_to

                        enrich_whatsapp_send_to(pending_confirm, completed)

                        yield _sse_frame(
                            "action_confirm",
                            {
                                "requiresConfirmation": True,
                                "tools": pending_confirm,
                                "warnings": plan.get("warnings", []),
                            },
                        )
                        yield _sse_frame(
                            "done",
                            {"intent": route.intent.value, "timings": timings},
                        )
                        return

            timings["planner_pre_stream_ms"] = (time.perf_counter() - t_stream) * 1000

        memory_block = ""
        if use_hybrid_memory:
            memory_block, status_emitted = await _hybrid_memory_block(
                query=payload.query,
                user_id=payload.user_id,
                skip_episodic=hybrid_skip_episodic,
                timings=timings,
                chat_session_id=payload.chat_session_id,
            )
            if status_emitted:
                yield _sse_frame("status", {"message": MEMORY_STATUS_MESSAGE})

        context_for_stream = assemble_turn_context(
            session_context=session_ctx or None,
            file_context=file_ctx or None,
            identity_block=identity_block,
            memory_block=memory_block or None,
            cap_file_context=cap_file,
        ) or prebuilt_context

        if manifest_text and manifest_text.strip():
            manifest_block = manifest_text.strip()
            context_for_stream = (
                f"{manifest_block}\n\n{context_for_stream}"
                if context_for_stream
                else manifest_block
            )

        async with ai_http_client(timeout=ORCHESTRATOR_STREAM_TIMEOUT) as client:
            tool_context = ""
            if tool_results:
                from orchestration.tool_results import format_tool_results_for_context

                tool_context = format_tool_results_for_context(tool_results)
            elif plan.get("planner") == "llm-scheduling-clarification":
                from orchestration.tool_results import format_scheduling_clarification

                tool_context = format_scheduling_clarification(
                    plan.get("warnings") or []
                )
            elif plan.get("planner") == "llm-scheduling-empty":
                from orchestration.tool_results import format_scheduling_plan_failure

                tool_context = format_scheduling_plan_failure(
                    plan.get("warnings") or []
                )
            elif plan.get("planner") in (
                "integration-blocked",
                "integration-unsupported",
            ):
                from orchestration.tool_results import format_integration_guidance

                tool_context = format_integration_guidance(
                    plan.get("user_guidance") or ""
                )
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
            warnings = plan.get("warnings") or []
            if warnings:
                stream_query += "\n\nPlanner warnings:\n" + "\n".join(f"- {w}" for w in warnings)

            body = {
                "query": stream_query,
                "rag_enabled": False,
                "retrieved_context": context_for_stream or None,
                "chat_history": chat_history,
                "user_id": payload.user_id,
                "task": stream_task,
                "attachments": payload.attachments,
                "resolved_attachments": payload.resolved_attachments,
                "personality_id": payload.personality_id,
                "assistant_display_name": payload.assistant_display_name,
                "system_prompt": payload.system_prompt,
            }
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
                            ":8000). cognitive-runtime alone does not expose "
                            "/v1/chat/stream."
                        )
                    message = (
                        f"AI service error ({response.status_code}): "
                        f"{snippet[:200] or 'no body'}.{hint}"
                    )
                    yield _sse_frame("error", {"message": message})
                    yield _sse_frame("done", {})
                    return

                first_byte = True
                async for chunk in response.aiter_bytes():
                    if await request.is_disconnected():
                        await response.aclose()
                        break
                    if first_byte:
                        timings["time_to_first_byte_ms"] = (
                            time.perf_counter() - turn_t0
                        ) * 1000
                        logger.info(
                            "[agent] first_byte_ms=%.0f intent=%s budget_ms=%.0f rag_ms=%.0f",
                            timings["time_to_first_byte_ms"],
                            route.intent.value,
                            memory_prestream_budget_ms(),
                            timings.get("rag_ms", 0),
                        )
                        first_byte = False
                    yield chunk
        timings["stream_total_ms"] = (time.perf_counter() - t_stream) * 1000

    return StreamingResponse(stream_response(), media_type="text/event-stream")


@app.post("/v1/agent/plan")
async def agent_plan(payload: AgentTurnRequest):
    from orchestration.planner import plan_tools
    from orchestration.context import (
        build_context,
        fetch_integration_manifest,
        is_rag_globally_enabled,
    )

    effective_rag = is_rag_globally_enabled() and payload.rag_enabled
    context_str = await build_context(
        payload.query, payload.user_id, payload.chat_history, effective_rag
    )
    manifest_text, manifest_caps, manifest_connections, manifest_connection_states = (
        await fetch_integration_manifest(payload.user_id)
    )
    del manifest_text
    return await plan_tools(
        payload.query,
        context_str,
        payload.user_id,
        manifest_caps=manifest_caps,
        manifest_connections=manifest_connections,
        manifest_connection_states=manifest_connection_states,
        routing_query=payload.routing_query,
        timezone=payload.timezone,
        chat_history=payload.chat_history,
    )
