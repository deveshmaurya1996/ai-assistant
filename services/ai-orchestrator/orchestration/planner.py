import json
import os
import re
from typing import Any, Dict, List, Set, Tuple

import httpx

TOOL_RUNTIME_URL = os.getenv("TOOL_RUNTIME_URL", "http://localhost:3011")
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")


async def _available_tools(
    user_id: str,
) -> Tuple[Set[str], List[Dict[str, Any]], List[Dict[str, Any]]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(
            f"{TOOL_RUNTIME_URL}/v1/tools/available",
            params={"userId": user_id},
        )
        res.raise_for_status()
        data = res.json()
    tool_schemas = data.get("tools", [])
    tools = {t["function"]["name"] for t in tool_schemas if t.get("function")}
    connections = data.get("connections", [])
    return tools, connections, tool_schemas


def _parse_llm_json(raw: str) -> Dict[str, Any]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except Exception:
        return {"tools": []}


def _extract_contact_name(query: str) -> str | None:
    patterns = [
        r"send(?:\s+a)?\s+message\s+to\s+(\w+)",
        r"text\s+(\w+)",
        r"message\s+(\w+)",
        r"whatsapp\s+(\w+)",
        r"to\s+(\w+)\s*[:,-]",
    ]
    for pattern in patterns:
        m = re.search(pattern, query, re.IGNORECASE)
        if m:
            name = m.group(1)
            if name.lower() not in ("a", "the", "my", "on", "via", "whatsapp"):
                return name
    return None


def _parse_whatsapp_send_args(query: str) -> Dict[str, str]:
    contact = _extract_contact_name(query) or "contact"
    message = query
    colon = re.search(r"[:,-]\s*(.+)$", query)
    if colon:
        message = colon.group(1).strip()
    elif "saying" in query.lower():
        parts = re.split(r"\bsaying\b", query, flags=re.IGNORECASE, maxsplit=1)
        if len(parts) > 1:
            message = parts[1].strip()
    return {"to": contact, "message": message}


def _heuristic_tools(query: str, available: Set[str]) -> List[Dict[str, Any]]:
    tools: List[Dict[str, Any]] = []
    q = query.lower()

    if any(w in q for w in ["whatsapp", "wa ", "message", "text", "send"]) and (
        "whatsapp.send_message" in available or "whatsapp.search_chats" in available
    ):
        if "send" in q or "message" in q or "text" in q:
            contact_hint = _extract_contact_name(query)
            if contact_hint and "whatsapp.search_chats" in available:
                tools.append(
                    {"tool": "whatsapp.search_chats", "args": {"query": contact_hint}}
                )
            if "whatsapp.send_message" in available:
                tools.append(
                    {
                        "tool": "whatsapp.send_message",
                        "args": _parse_whatsapp_send_args(query),
                    }
                )

    return tools


def _heuristic_note_tools(query: str, available: Set[str]) -> List[Dict[str, Any]]:
    q = query.lower()
    if not any(
        w in q
        for w in [
            "note",
            "remember",
            "save this",
            "save that",
            "write down",
            "jot down",
        ]
    ):
        return []
    tools: List[Dict[str, Any]] = []
    if "notes.create" in available and any(
        w in q for w in ["save", "remember", "note", "write down", "jot"]
    ):
        content = query
        if "saying" in q:
            parts = re.split(r"\bsaying\b", query, flags=re.IGNORECASE, maxsplit=1)
            if len(parts) > 1:
                content = parts[1].strip()
        tools.append({"tool": "notes.create", "args": {"content": content}})
    if "notes.search" in available and any(w in q for w in ["find note", "search note", "my notes"]):
        tools.append({"tool": "notes.search", "args": {"query": query}})
    return tools


async def plan_tools(
    query: str,
    context: str,
    user_id: str,
    preferred_model: str | None = None,
) -> Dict[str, Any]:
    """LLM planner — only returns tools available for this user."""
    available, connections, tool_schemas = await _available_tools(user_id)

    if not available:
        return {
            "query": query,
            "context": context,
            "user_id": user_id,
            "tools": [],
            "connections": connections,
            "available_tool_count": 0,
            "planner": "llm",
        }

    system = (
        "You are an agent that selects tools to accomplish the user's request.\n"
        "Return ONLY valid JSON with shape: {\"tools\":[{\"tool\":\"name\",\"args\":{...}}]}.\n"
        "Use only tool names from the provided list. If no tool is needed, return {\"tools\":[]}.\n"
        "Prefer minimal tools. If sending a WhatsApp message to a person name, first search chats.\n"
    )

    tool_list = [t.get("function", {}).get("name") for t in tool_schemas]
    tool_list = [t for t in tool_list if t]

    user_prompt = (
        f"User query: {query}\n\n"
        f"Context:\n{context}\n\n"
        f"Available tools:\n{tool_list}\n\n"
        "JSON:"
    )

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{AI_SERVICE_URL}/v1/chat/complete",
            json={
                "query": user_prompt,
                "rag_enabled": False,
                "chat_history": [{"role": "system", "content": system}],
                "user_id": user_id,
                "preferred_model": preferred_model,
            },
        )
        res.raise_for_status()
        data = res.json()

    raw = str(data.get("text", "")).strip()
    planned = _parse_llm_json(raw)

    out_tools: List[Dict[str, Any]] = []
    for item in planned.get("tools", []) if isinstance(planned, dict) else []:
        name = item.get("tool")
        if not name or name not in available:
            continue
        args = item.get("args", {}) if isinstance(item.get("args", {}), dict) else {}
        out_tools.append({"tool": name, "args": args})

    if not out_tools:
        out_tools = _heuristic_tools(query, available)
    if not out_tools:
        out_tools = _heuristic_note_tools(query, available)

    return {
        "query": query,
        "context": context,
        "user_id": user_id,
        "tools": out_tools,
        "connections": connections,
        "available_tool_count": len(available),
        "planner": "llm",
        "model_used": data.get("model_used"),
    }
