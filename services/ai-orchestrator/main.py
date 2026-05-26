
import os
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

app = FastAPI(title="AI Orchestrator", version="1.0.0")

TOOL_RUNTIME_URL = os.getenv("TOOL_RUNTIME_URL", "http://localhost:3011")
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")


class AgentTurnRequest(BaseModel):
    query: str
    user_id: str
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    chat_session_id: Optional[str] = None
    source: str = "chat"
    rag_enabled: bool = True
    preferred_model: Optional[str] = None
    confirmed: bool = False


class ToolCallRequest(BaseModel):
    user_id: str
    tool: str
    args: Dict[str, Any]
    source: str = "chat"
    confirmed: bool = False
    preview: bool = False
    chat_session_id: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-orchestrator"}


@app.get("/v1/tools/available")
async def tools_available(user_id: str | None = None):
    async with httpx.AsyncClient() as client:
        params = {"userId": user_id} if user_id else {}
        res = await client.get(f"{TOOL_RUNTIME_URL}/v1/tools/available", params=params)
        res.raise_for_status()
        return res.json()


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
    from orchestration.planner import plan_tools
    from orchestration.executor import execute_planned_tools
    from orchestration.context import build_context

    context_str = await build_context(
        payload.query, payload.user_id, payload.chat_history, payload.rag_enabled
    )
    plan = await plan_tools(payload.query, context_str, payload.user_id, payload.preferred_model)

    tool_results: List[Dict[str, Any]] = []
    pending_confirm: List[Dict[str, Any]] = []

    if plan.get("tools"):
        tool_results = await execute_planned_tools(
            plan["tools"],
            user_id=payload.user_id,
            source=payload.source,
            confirmed=payload.confirmed,
            chat_session_id=payload.chat_session_id,
            connections=plan.get("connections", []),
        )
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
                        chats = result.get("chats", []) if isinstance(result, dict) else []
                        if chats:
                            args["to"] = chats[0].get("jid", args.get("to"))
                            break

        return JSONResponse(
            {
                "requiresConfirmation": True,
                "tools": pending_confirm,
            }
        )

    async def stream_response():
        async with httpx.AsyncClient(timeout=120.0) as client:
            tool_context = ""
            if tool_results:
                tool_context = "\n\nTool results:\n" + str(tool_results)
            async with client.stream(
                "POST",
                f"{AI_SERVICE_URL}/v1/chat/stream",
                json={
                    "query": payload.query + tool_context,
                    "rag_enabled": False,
                    "chat_history": payload.chat_history,
                    "user_id": payload.user_id,
                    "preferred_model": payload.preferred_model,
                },
            ) as response:
                async for chunk in response.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream_response(), media_type="text/event-stream")


@app.post("/v1/agent/plan")
async def agent_plan(payload: AgentTurnRequest):
    from orchestration.planner import plan_tools
    from orchestration.context import build_context

    context_str = await build_context(
        payload.query, payload.user_id, payload.chat_history, payload.rag_enabled
    )
    return await plan_tools(payload.query, context_str, payload.user_id)
