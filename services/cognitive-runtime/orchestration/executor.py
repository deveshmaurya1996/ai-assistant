"""Tool execution dispatch — WhatsApp via gateway Baileys; others via skill-runtime."""
import asyncio
import os
import re
from typing import Any, Dict, List, Optional

import httpx

from env_loader import resolve_public_api_url

GATEWAY_URL = resolve_public_api_url()
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")
SKILL_RUNTIME_URL = os.getenv("SKILL_RUNTIME_URL", "http://localhost:3014")
TOOL_RUNTIME_URL = os.getenv("TOOL_RUNTIME_URL", "http://localhost:3011")

from orchestration.capability_map import (
    default_provider_for_capability,
    normalize_planned_item,
)


def _internal_headers() -> Dict[str, str]:
    return {"X-Internal-Token": INTERNAL_SERVICE_TOKEN}


def _resolve_connection_id(tool: str, connections: List[Dict[str, Any]]) -> Optional[str]:
    prefix = tool.split(".")[0]
    provider_map = {
        "gmail": "google",
        "email": "google",
        "calendar": "google",
        "drive": "google",
        "whatsapp": "whatsapp",
        "files": "files",
        "notes": "notes",
    }
    provider_id = provider_map.get(prefix, prefix)
    for conn in connections:
        if conn.get("providerId") == provider_id:
            return conn.get("id")
    return None


def _looks_like_jid(value: str) -> bool:
    return "@" in value


def _looks_like_phone(value: str) -> bool:
    digits = re.sub(r"\D", "", value)
    return len(digits) >= 10


async def _poll_execution(
    client: httpx.AsyncClient, execution_id: str, tool_name: str, max_attempts: int = 240
) -> Dict[str, Any]:
    for _ in range(max_attempts):
        await asyncio.sleep(0.5)
        status_res = await client.get(f"{TOOL_RUNTIME_URL}/v1/executions/{execution_id}")
        if status_res.status_code >= 400:
            return {"tool": tool_name, "status": "failed", "error": status_res.text}
        status_data = status_res.json()
        if status_data.get("status") in ("completed", "failed", "cancelled"):
            return {"tool": tool_name, **status_data}
    return {
        "tool": tool_name,
        "status": "failed",
        "error": "Execution timed out — try again.",
    }


async def _execute_whatsapp_via_gateway(
    client: httpx.AsyncClient,
    user_id: str,
    tool_name: str,
    args: Dict[str, Any],
    source: str,
    confirmed: bool,
    connection_id: Optional[str],
    chat_session_id: Optional[str],
) -> Dict[str, Any]:
    """Direct Baileys in gateway — same path as inline confirm."""
    res = await client.post(
        f"{GATEWAY_URL}/internal/integrations/whatsapp/execute",
        json={
            "userId": user_id,
            "tool": tool_name,
            "args": args,
            "source": source,
            "confirmed": confirmed,
            "connectionId": connection_id,
            "chatSessionId": chat_session_id,
        },
        headers=_internal_headers(),
    )
    if res.status_code == 428:
        body = res.json()
        return {
            "tool": tool_name,
            "requiresConfirmation": True,
            "args": args,
            "error": body,
        }
    if res.status_code >= 400:
        try:
            err = res.json()
            msg = err.get("error") if isinstance(err, dict) else res.text
        except Exception:
            msg = res.text
        return {"tool": tool_name, "status": "failed", "error": msg}

    data = res.json()
    return {
        "tool": tool_name,
        "status": "completed",
        "result": data.get("result"),
    }


async def execute_planned_tools(
    tools: List[Dict[str, Any]],
    user_id: str,
    source: str,
    confirmed: bool,
    chat_session_id: Optional[str] = None,
    connections: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    connections = connections or []
    resolved_jid: Optional[str] = None

    async with httpx.AsyncClient(timeout=120.0) as client:
        for raw in tools:
            item = normalize_planned_item(dict(raw))
            tool_name = item.get("tool")
            if not tool_name:
                results.append(
                    {
                        "capability": item.get("capability"),
                        "error": "Could not resolve capability to tool",
                    }
                )
                continue
            args = dict(item.get("args", {}))
            connection_id = _resolve_connection_id(tool_name, connections)

            if tool_name == "whatsapp.send_message":
                if resolved_jid:
                    args["to"] = resolved_jid
                elif not _looks_like_jid(str(args.get("to", ""))):
                    for prev in results:
                        if prev.get("tool") == "whatsapp.search_chats" and prev.get("result"):
                            chats = (prev["result"] or {}).get("chats", [])
                            if chats and chats[0].get("jid"):
                                args["to"] = chats[0]["jid"]
                                resolved_jid = args["to"]
                                break

            if tool_name.startswith("reminder."):
                from orchestration.reminder_client import execute_reminder_via_gateway

                entry = await execute_reminder_via_gateway(
                    client, user_id, tool_name, args
                )
                results.append(entry)
                continue

            if tool_name.startswith("automation."):
                from orchestration.automation_client import execute_automation_via_gateway

                entry = await execute_automation_via_gateway(
                    client, user_id, tool_name, args
                )
                results.append(entry)
                continue

            if tool_name.startswith("whatsapp."):
                entry = await _execute_whatsapp_via_gateway(
                    client,
                    user_id,
                    tool_name,
                    args,
                    source,
                    confirmed,
                    connection_id,
                    chat_session_id,
                )
                results.append(entry)
                if tool_name == "whatsapp.search_chats" and entry.get("result"):
                    chats = (entry["result"] or {}).get("chats", [])
                    if chats and chats[0].get("jid"):
                        resolved_jid = chats[0]["jid"]
                continue

            exec_body: Dict[str, Any] = {
                "userId": user_id,
                "tool": tool_name,
                "args": args,
                "source": source,
                "confirmed": confirmed,
            }
            if chat_session_id:
                exec_body["chatSessionId"] = chat_session_id
            if connection_id:
                exec_body["connectionId"] = connection_id
            if item.get("capability"):
                provider = item.get("provider") or default_provider_for_capability(
                    item["capability"]
                )
                exec_body = {
                    "userId": user_id,
                    "capability": item["capability"],
                    "args": args,
                    "source": source,
                    "confirmed": confirmed,
                    "provider": provider,
                }
                if chat_session_id:
                    exec_body["chatSessionId"] = chat_session_id
                if connection_id:
                    exec_body["connectionId"] = connection_id

            res = await client.post(f"{SKILL_RUNTIME_URL}/v1/execute", json=exec_body)
            if res.status_code == 428:
                body = res.json()
                results.append(
                    {
                        "tool": tool_name,
                        "capability": item.get("capability"),
                        "requiresConfirmation": True,
                        "args": args,
                        "error": body,
                    }
                )
                continue
            if res.status_code >= 400:
                results.append({"tool": tool_name, "error": res.text})
                continue

            data = res.json()
            execution_id = data.get("executionId")
            if execution_id:
                entry = await _poll_execution(client, execution_id, tool_name)
                results.append(entry)
            else:
                results.append({"tool": tool_name, **data})
    return results
