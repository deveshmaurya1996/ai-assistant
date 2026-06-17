
import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

from env_loader import (
    resolve_capability_runtime_url,
    resolve_internal_gateway_url,
    resolve_tool_runtime_url,
)
from tools.registry import (
    default_provider_for_capability,
    normalize_planned_item,
)
from orchestration.contacts import (
    looks_like_jid,
    looks_like_phone,
    resolve_whatsapp_jid_from_search,
)
from tools.clients.gateway_client import internal_headers
from tools.permissions import sanitize_tool_args, validate_tool_chain

logger = logging.getLogger(__name__)

GATEWAY_URL = resolve_internal_gateway_url()
CAPABILITY_RUNTIME_URL = resolve_capability_runtime_url()
TOOL_RUNTIME_URL = resolve_tool_runtime_url()


def _resolve_connection_id(tool: str, connections: List[Dict[str, Any]]) -> Optional[str]:
    prefix = tool.split(".")[0]
    provider_map = {
        "gmail": "google",
        "email": "google",
        "calendar": "google",
        "drive": "google",
        "whatsapp": "whatsapp",
        "files": "files",
    }
    provider_id = provider_map.get(prefix, prefix)
    for conn in connections:
        if conn.get("providerId") == provider_id:
            return conn.get("id")
    return None


async def _poll_execution(
    client: httpx.AsyncClient, execution_id: str, tool_name: str, max_attempts: int = 240
) -> Dict[str, Any]:
    for _ in range(max_attempts):
        await asyncio.sleep(0.5)
        status_res = await client.get(
            f"{TOOL_RUNTIME_URL}/v1/executions/{execution_id}",
            headers=internal_headers(),
        )
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
        headers=internal_headers(),
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

    tool_names = [
        normalize_planned_item(dict(raw)).get("tool")
        for raw in tools
        if normalize_planned_item(dict(raw)).get("tool")
    ]
    if len(tool_names) > 1 and not validate_tool_chain(tool_names):
        logger.warning("[executor] blocked dangerous tool chain: %s", tool_names)
        return [
            {
                "status": "failed",
                "error": "This combination of tools is not allowed for safety reasons.",
            }
        ]

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
            args = sanitize_tool_args(dict(item.get("args", {})))
            connection_id = _resolve_connection_id(tool_name, connections)

            if tool_name in ("whatsapp.send_message", "whatsapp.read_chat"):
                if tool_name == "whatsapp.send_message":
                    target_key = "to"
                    target_val = str(args.get("to", ""))
                else:
                    target_key = "chatId"
                    target_val = str(args.get("chatId") or args.get("jid") or "")

                found_jid = resolve_whatsapp_jid_from_search(
                    target_val, results, resolved_jid
                )
                if found_jid:
                    args[target_key] = found_jid
                    if looks_like_jid(found_jid):
                        resolved_jid = found_jid
                elif not looks_like_jid(target_val) and not looks_like_phone(target_val):
                    if tool_name == "whatsapp.read_chat":
                        contact_label = target_val or "that contact"
                        results.append(
                            {
                                "tool": tool_name,
                                "status": "failed",
                                "error": (
                                    f'Could not find WhatsApp chat for "{contact_label}". '
                                    "Try the exact contact name or phone number."
                                ),
                            }
                        )
                        continue
                elif looks_like_phone(target_val) and not looks_like_jid(target_val):
                    args[target_key] = target_val

            if tool_name.startswith("reminder."):
                from tools.clients.reminder_client import execute_reminder_via_gateway

                entry = await execute_reminder_via_gateway(
                    client, user_id, tool_name, args
                )
                results.append(entry)
                continue

            if tool_name.startswith("automation."):
                from tools.clients.automation_client import execute_automation_via_gateway

                entry = await execute_automation_via_gateway(
                    client, user_id, tool_name, args
                )
                results.append(entry)
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

            res = await client.post(
                f"{CAPABILITY_RUNTIME_URL}/v1/execute",
                json=exec_body,
                headers=internal_headers(),
            )
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

            if tool_name == "whatsapp.search_chats":
                last = results[-1] if results else {}
                chats = ((last.get("result") or {}).get("data") or last.get("result") or {}).get(
                    "chats", []
                )
                if not chats and isinstance(last.get("result"), dict):
                    chats = last["result"].get("chats", [])
                if chats and chats[0].get("jid"):
                    resolved_jid = chats[0]["jid"]
    return results
