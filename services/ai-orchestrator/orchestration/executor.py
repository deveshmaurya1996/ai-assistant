"""Tool execution dispatch to tool-runtime."""
import os
from typing import Any, Dict, List, Optional

import httpx

TOOL_RUNTIME_URL = os.getenv("TOOL_RUNTIME_URL", "http://localhost:3011")


def _resolve_connection_id(tool: str, connections: List[Dict[str, Any]]) -> Optional[str]:
    prefix = tool.split(".")[0]
    provider_map = {
        "gmail": "google",
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
        for item in tools:
            tool_name = item["tool"]
            args = dict(item.get("args", {}))

            if tool_name == "whatsapp.send_message" and resolved_jid:
                args["to"] = resolved_jid
            elif tool_name == "whatsapp.send_message" and "@" not in str(args.get("to", "")):
                search_res = None
                for prev in results:
                    if prev.get("tool") == "whatsapp.search_chats" and prev.get("result"):
                        search_res = prev.get("result")
                        break
                if search_res and isinstance(search_res, dict):
                    chats = search_res.get("chats", [])
                    if chats:
                        args["to"] = chats[0].get("jid", args.get("to"))

            connection_id = _resolve_connection_id(tool_name, connections)

            res = await client.post(
                f"{TOOL_RUNTIME_URL}/v1/executions",
                json={
                    "userId": user_id,
                    "tool": tool_name,
                    "args": args,
                    "source": source,
                    "confirmed": confirmed,
                    "chatSessionId": chat_session_id,
                    "connectionId": connection_id,
                },
            )
            if res.status_code == 428:
                body = res.json()
                results.append(
                    {
                        "tool": tool_name,
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
                import asyncio

                for _ in range(60):
                    await asyncio.sleep(0.5)
                    status_res = await client.get(
                        f"{TOOL_RUNTIME_URL}/v1/executions/{execution_id}"
                    )
                    status_data = status_res.json()
                    if status_data.get("status") in (
                        "completed",
                        "failed",
                        "cancelled",
                    ):
                        entry = {"tool": tool_name, **status_data}
                        results.append(entry)
                        if tool_name == "whatsapp.search_chats" and status_data.get("result"):
                            chats = status_data["result"].get("chats", [])
                            if chats:
                                resolved_jid = chats[0].get("jid")
                        break
            else:
                results.append({"tool": tool_name, **data})
    return results
