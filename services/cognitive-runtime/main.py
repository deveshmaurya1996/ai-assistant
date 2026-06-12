
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
    resolve_internal_gateway_url,
    resolve_tool_runtime_url,
)

load_service_env()
GATEWAY_URL = resolve_internal_gateway_url()
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
    memory_budget_ms: Optional[float] = None,
) -> tuple[str, bool]:
    """Backward-compatible alias for orchestration.memory_fetch."""
    from orchestration.memory_fetch import fetch_hybrid_memory_block

    return await fetch_hybrid_memory_block(
        query=query,
        user_id=user_id,
        skip_episodic=skip_episodic,
        timings=timings,
        chat_session_id=chat_session_id,
        memory_budget_ms=memory_budget_ms,
    )


ORCHESTRATOR_STREAM_TIMEOUT = float(os.getenv("ORCHESTRATOR_STREAM_TIMEOUT", "45"))


def _log_agent_stage(stage: str, **extra: Any) -> None:
    from orchestration.pipeline_debug import log_agent_stage

    log_agent_stage(stage, **extra)


def warm_agent_modules() -> None:
    """Load orchestration modules at startup so the first chat turn is not blocked."""
    from orchestration.agent_pipeline import iter_agent_turn_sse  # noqa: F401
    from orchestration.context import fetch_integration_manifest  # noqa: F401
    from orchestration.executor import execute_planned_tools  # noqa: F401
    from orchestration.image_intent import classify_image_intent  # noqa: F401
    from orchestration.planner import plan_tools  # noqa: F401
    from orchestration.prompt_compression import compress_prompt_if_needed  # noqa: F401
    from orchestration.speed_router import resolve_speed_profile  # noqa: F401
    from orchestration.stream_chat import passthrough_chat_stream  # noqa: F401
    from orchestration.turn_contract import build_resolved_turn  # noqa: F401
    from orchestration.turn_router import classify_turn  # noqa: F401


from orchestration.agent_pipeline import iter_agent_turn_sse


@app.post("/v1/agent/turn")
async def agent_turn(payload: AgentTurnRequest, request: Request):
    """Single chat entry — all routing decisions live in orchestration.agent_pipeline."""
    return StreamingResponse(
        iter_agent_turn_sse(payload, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
