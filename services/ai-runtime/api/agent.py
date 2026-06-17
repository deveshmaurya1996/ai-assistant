"""Agent turn API."""

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from agent.kernel import run_turn
from agent.request_context import RequestContext
from env_loader import (
    load_service_env,
    resolve_ai_service_url,
    resolve_capability_runtime_url,
    resolve_internal_gateway_url,
    resolve_tool_runtime_url,
)
from orchestration.agent_pipeline import iter_agent_turn_sse
from tools.clients.gateway_client import internal_headers

logger = logging.getLogger(__name__)

load_service_env()

router = APIRouter(tags=["agent"])

GATEWAY_URL = resolve_internal_gateway_url()
TOOL_RUNTIME_URL = resolve_tool_runtime_url()
CAPABILITY_RUNTIME_URL = resolve_capability_runtime_url()
AI_SERVICE_URL = resolve_ai_service_url()
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")


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
    preferred_model_id: Optional[str] = None
    session_model_id: Optional[str] = None
    voice_profile_id: Optional[str] = None
    voice_max_sentences: Optional[int] = None


class ToolCallRequest(BaseModel):
    user_id: str
    tool: str
    args: Dict[str, Any]
    source: str = "chat"
    confirmed: bool = False
    preview: bool = False
    chat_session_id: Optional[str] = None


class ManifestInvalidateRequest(BaseModel):
    userId: str


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


@router.post("/internal/integrations/manifest/invalidate")
async def invalidate_manifest(body: ManifestInvalidateRequest):
    from context.context_builder import invalidate_integration_manifest

    user_id = body.userId.strip()
    if not user_id:
        return JSONResponse(status_code=400, content={"error": "userId is required"})
    invalidate_integration_manifest(user_id)
    return {"ok": True}


@router.get("/v1/tools/available")
async def tools_available(user_id: str | None = None):
    async with httpx.AsyncClient() as client:
        params = {"userId": user_id} if user_id else {}
        res = await client.get(
            f"{TOOL_RUNTIME_URL}/v1/tools/available",
            params=params,
            headers=internal_headers(),
        )
        res.raise_for_status()
        return res.json()


@router.get("/v1/agent/diagnostics")
async def agent_diagnostics(user_id: str):
    from context.context_builder import fetch_integration_manifest

    manifest_text, manifest_caps, connections, _ = await fetch_integration_manifest(user_id)

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
        internal_headers(),
    )
    tool_runtime = await _probe(TOOL_RUNTIME_URL, "/health", None, internal_headers())
    capability_runtime = await _probe(
        CAPABILITY_RUNTIME_URL, "/health", None, internal_headers()
    )
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


@router.get("/v1/agent/diagnostics/timing")
async def agent_diagnostics_timing(user_id: str, query: str = "hello"):
    from context.context_builder import fetch_integration_manifest, fetch_rag_context
    from orchestration.turn_router import classify_turn

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


@router.get("/v1/agent/turns")
async def agent_recent_turns(user_id: str, limit: int = 20):
    from orchestration.turn_trace import get_recent_turn_traces

    capped = min(max(limit, 1), 50)
    return {
        "userId": user_id,
        "turns": get_recent_turn_traces(user_id, capped),
    }


@router.post("/v1/tools/execute")
async def execute_tool(payload: ToolCallRequest):
    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(
            f"{TOOL_RUNTIME_URL}/v1/executions",
            json=payload.model_dump(),
            headers=internal_headers(),
        )
        if res.status_code == 428:
            return {"requiresConfirmation": True, "error": res.json()}
        res.raise_for_status()
        return res.json()


@router.post("/v1/agent/turn")
async def agent_turn(payload: AgentTurnRequest, request: Request):
    context = RequestContext.from_turn_request(payload)
    return StreamingResponse(
        run_turn(context, payload.query, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/v1/agent/plan")
async def agent_plan(payload: AgentTurnRequest):
    from context.context_builder import (
        build_context,
        fetch_integration_manifest,
        is_rag_globally_enabled,
    )
    from orchestration.planner import plan_tools

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


def warm_agent_modules() -> None:
    """Load orchestration modules at startup so the first chat turn is not blocked."""
    from orchestration.agent_pipeline import iter_agent_turn_sse  # noqa: F401
    from context.context_builder import fetch_integration_manifest  # noqa: F401
    from orchestration.executor import execute_planned_tools  # noqa: F401
    from orchestration.image_intent import classify_image_intent  # noqa: F401
    from orchestration.planner import plan_tools  # noqa: F401
    from orchestration.prompt_compression import compress_prompt_if_needed  # noqa: F401
    from orchestration.speed_router import resolve_speed_profile  # noqa: F401
    from orchestration.stream_chat import passthrough_chat_stream  # noqa: F401
    from orchestration.turn_contract import build_resolved_turn  # noqa: F401
    from orchestration.turn_router import classify_turn  # noqa: F401
