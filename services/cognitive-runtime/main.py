
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

app = FastAPI(title="Cognitive Runtime", version="1.0.0")

SKILL_RUNTIME_URL = os.getenv("SKILL_RUNTIME_URL", "http://localhost:3014")
TOOL_RUNTIME_URL = os.getenv("TOOL_RUNTIME_URL", "http://localhost:3011")
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")
GATEWAY_URL = os.getenv(
    "GATEWAY_URL", os.getenv("API_URL", os.getenv("BETTER_AUTH_URL", "http://localhost:3050"))
)
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")


def _sse_frame(event: str, data: Any) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


class AgentTurnRequest(BaseModel):
    query: str
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
    return {"status": "ok", "service": "cognitive-runtime"}


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

    manifest_text, manifest_caps, connections = await fetch_integration_manifest(user_id)
    headers = {"X-Internal-Token": INTERNAL_SERVICE_TOKEN}

    gateway_manifest = await _probe(
        GATEWAY_URL,
        "/internal/integrations/manifest",
        {"userId": user_id},
        {"X-Internal-Token": INTERNAL_SERVICE_TOKEN},
    )
    skill_manifest = await _probe(
        SKILL_RUNTIME_URL,
        "/v1/integrations/manifest",
        {"userId": user_id},
    )
    tool_runtime = await _probe(TOOL_RUNTIME_URL, "/health")
    skill_runtime = await _probe(SKILL_RUNTIME_URL, "/health")
    ai_runtime = await _probe(AI_SERVICE_URL, "/health")

    return {
        "userId": user_id,
        "connections": connections,
        "manifestCapabilityCount": len(manifest_caps),
        "manifestPreview": manifest_text[:500] if manifest_text else "",
        "probes": {
            "gatewayManifest": gateway_manifest,
            "skillManifest": skill_manifest,
            "toolRuntime": tool_runtime,
            "skillRuntime": skill_runtime,
            "aiRuntime": ai_runtime,
        },
    }


@app.get("/v1/agent/diagnostics/timing")
async def agent_diagnostics_timing(user_id: str, query: str = "hello"):
    """Smoke-test conversational path timings."""
    from orchestration.context import fetch_rag_context, fetch_integration_manifest
    from orchestration.planner import is_conversational_query

    timings: Dict[str, float] = {}
    t0 = time.perf_counter()
    manifest_text, _, _ = await fetch_integration_manifest(user_id)
    timings["manifest_ms"] = (time.perf_counter() - t0) * 1000

    t1 = time.perf_counter()
    await fetch_rag_context(query, user_id)
    timings["rag_ms"] = (time.perf_counter() - t1) * 1000

    timings["conversational"] = is_conversational_query(query)
    return {"query": query, "timings": timings, "manifest_chars": len(manifest_text)}


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


@app.post("/v1/agent/turn")
async def agent_turn(payload: AgentTurnRequest):
    from orchestration.planner import is_conversational_query, plan_tools
    from orchestration.executor import execute_planned_tools
    from orchestration.context import (
        build_context,
        fetch_integration_manifest,
        fetch_rag_context,
        is_rag_globally_enabled,
        merge_context_blocks,
    )

    turn_t0 = time.perf_counter()
    timings: Dict[str, float] = {}

    tool_results: List[Dict[str, Any]] = list(payload.tool_results or [])
    pending_confirm: List[Dict[str, Any]] = []
    plan: Dict[str, Any] = {"tools": [], "connections": [], "warnings": []}

    has_attachments = bool(payload.attachments or payload.resolved_attachments)
    def _attachment_has_vision(a: Dict[str, Any]) -> bool:
        return bool(a.get("imageDataUrl") or a.get("embeddedImageDataUrls"))

    has_images = any(_attachment_has_vision(a) for a in payload.resolved_attachments)
    has_file_content = any(
        a.get("textExcerpt") or a.get("note") for a in payload.resolved_attachments
    )
    attachment_fast_path = has_attachments and not payload.confirmed
    conversational = (
        not has_attachments
        and not payload.confirmed
        and not payload.skip_planning
        and is_conversational_query(payload.query)
    )

    manifest_text = ""
    file_ctx = (payload.file_retrieval_context or "").strip()
    effective_rag = is_rag_globally_enabled() and payload.rag_enabled
    rag_block = ""
    if effective_rag and (payload.query or "").strip():
        t_rag = time.perf_counter()
        rag_block = await fetch_rag_context(payload.query, payload.user_id)
        timings["rag_ms"] = (time.perf_counter() - t_rag) * 1000
    retrieved_context = merge_context_blocks(file_ctx, rag_block)

    if attachment_fast_path:
        logger.info(
            "[agent] attachment fast path images=%s query_len=%d",
            has_images,
            len(payload.query or ""),
        )
    elif conversational:
        logger.info("[agent] conversational fast path query=%r", payload.query[:80])
    else:
        t_manifest = time.perf_counter()
        manifest_text, manifest_caps, manifest_connections = await fetch_integration_manifest(
            payload.user_id
        )
        timings["manifest_ms"] = (time.perf_counter() - t_manifest) * 1000

        if not payload.skip_planning:
            t_ctx = time.perf_counter()
            context_str = await build_context(
                payload.query,
                payload.user_id,
                payload.chat_history,
                effective_rag,
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
            )
            timings["plan_tools_ms"] = (time.perf_counter() - t_plan) * 1000
            timings["planner"] = plan.get("planner", "")

            work_items = plan.get("tools") or plan.get("capabilities") or []
            if work_items:
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
                pending_confirm = [r for r in tool_results if r.get("requiresConfirmation")]
                completed = [r for r in tool_results if not r.get("requiresConfirmation")]

                if pending_confirm and not payload.confirmed:
                    for pending in pending_confirm:
                        if pending.get("tool") == "whatsapp.send_message":
                            args = pending.setdefault("args", {})
                            if "@" not in str(args.get("to", "")):
                                for done in completed:
                                    if done.get("tool") != "whatsapp.search_chats":
                                        continue
                                    result = done.get("result") or {}
                                    chats = (
                                        result.get("chats", [])
                                        if isinstance(result, dict)
                                        else []
                                    )
                                    if chats:
                                        args["to"] = chats[0].get("jid", args.get("to"))
                                        break

                    return JSONResponse(
                        {
                            "requiresConfirmation": True,
                            "tools": pending_confirm,
                            "warnings": plan.get("warnings", []),
                        }
                    )

    from orchestration.image_intent import classify_image_intent

    image_intent = None
    if not payload.confirmed:
        image_intent = classify_image_intent(
            payload.query, has_image_attachment=has_images
        )

    if image_intent:

        async def image_stream():
            logger.info("[agent] image fast path intent=%s", image_intent)
            async with httpx.AsyncClient(timeout=300.0) as client:
                res = await client.post(
                    f"{AI_SERVICE_URL}/v1/image/from-chat",
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

    if has_attachments:
        stream_task = (
            "fast_chat"
            if has_file_content and not has_images
            else "file_analysis"
        )
    else:
        stream_task = "fast_chat" if conversational else "auto"

    async def stream_response():
        t_stream = time.perf_counter()
        async with httpx.AsyncClient(timeout=120.0) as client:
            tool_context = ""
            if tool_results:
                tool_context = "\n\nTool results:\n" + str(tool_results)
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
            if not conversational and not attachment_fast_path and manifest_text:
                stream_query += "\n\nIntegration context (connected apps and capabilities):\n"
                stream_query += manifest_text
            warnings = plan.get("warnings") or []
            if warnings:
                stream_query += "\n\nPlanner warnings:\n" + "\n".join(f"- {w}" for w in warnings)

            body = {
                "query": stream_query,
                "rag_enabled": False,
                "retrieved_context": retrieved_context or None,
                "chat_history": payload.chat_history,
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
                f"{AI_SERVICE_URL}/v1/chat/stream",
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
                    message = (
                        f"AI service error ({response.status_code}): "
                        f"{snippet[:200] or 'no body'}"
                    )
                    yield _sse_frame("error", {"message": message})
                    yield _sse_frame("done", {})
                    return

                first_byte = True
                async for chunk in response.aiter_bytes():
                    if first_byte:
                        timings["time_to_first_byte_ms"] = (
                            time.perf_counter() - turn_t0
                        ) * 1000
                        logger.info(
                            "[agent] first_byte_ms=%.0f conversational=%s",
                            timings["time_to_first_byte_ms"],
                            conversational,
                        )
                        first_byte = False
                    yield chunk
        timings["stream_total_ms"] = (time.perf_counter() - t_stream) * 1000

    logger.info(
        "[agent] turn_pre_stream_ms=%.0f conversational=%s timings=%s",
        (time.perf_counter() - turn_t0) * 1000,
        conversational,
        timings,
    )

    return StreamingResponse(stream_response(), media_type="text/event-stream")


@app.post("/v1/agent/plan")
async def agent_plan(payload: AgentTurnRequest):
    from orchestration.planner import plan_tools
    from orchestration.context import build_context, is_rag_globally_enabled

    effective_rag = is_rag_globally_enabled() and payload.rag_enabled
    context_str = await build_context(
        payload.query, payload.user_id, payload.chat_history, effective_rag
    )
    return await plan_tools(payload.query, context_str, payload.user_id)
