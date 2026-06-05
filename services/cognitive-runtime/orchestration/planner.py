import json
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

from orchestration.capability_map import (
    CAPABILITY_TO_TOOL,
    default_provider_for_capability,
    normalize_planned_item,
)
from orchestration.context import fetch_integration_manifest

SKILL_RUNTIME_URL = os.getenv("SKILL_RUNTIME_URL", "http://localhost:3014")
TOOL_RUNTIME_URL = os.getenv("TOOL_RUNTIME_URL", "http://localhost:3011")
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")
PLANNER_COMPLETE_TIMEOUT = float(os.getenv("PLANNER_COMPLETE_TIMEOUT", "20"))


def _planner_model() -> str | None:
    explicit = os.getenv("PLANNER_MODEL", "").strip()
    if explicit:
        return explicit
    if os.getenv("NVIDIA_API_KEY"):
        return "auto"
    if os.getenv("POLLINATIONS_API_KEY"):
        return "auto"
    return None


def is_conversational_query(query: str) -> bool:
    return not is_likely_tool_query(query)


def is_likely_tool_query(query: str) -> bool:
    q = query.lower()
    integration_signals = [
        "whatsapp",
        "wa ",
        "gmail",
        "email",
        "inbox",
        "mail",
        "calendar",
        "meeting",
        "schedule",
        "drive",
        "google",
        "integration",
        "connected apps",
        "what is connected",
        "what's connected",
    ]
    file_signals = [
        "uploaded",
        "my pdf",
        "my document",
        "attached file",
        "attached pdf",
        "the contract",
        "page ",
        "my file",
        "my spreadsheet",
        "my image",
        "file search",
        "search my files",
    ]
    action_signals = [
        "send",
        "text ",
        "message to",
        "check my",
        "check the",
        "list my",
        "list unread",
        "show my",
        "read my",
        "search my",
        "summarize",
        "summary",
        "catch up",
        "remember this",
        "save this",
        "write down",
        "jot down",
        "find note",
        "my notes",
        "remind me",
        "remind ",
        "set a reminder",
        "set a reminder to",
        "need you to set a reminder",
        "notify me at",
        "notify me when",
        "ping me at",
    ]
    return any(
        signal in q
        for signal in integration_signals + action_signals + file_signals
    )


async def _available_tools(
    user_id: str,
    manifest_caps: Optional[Set[str]] = None,
    manifest_connections: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[Set[str], List[Dict[str, Any]], List[Dict[str, Any]], Set[str], List[str]]:
    """Merge gateway manifest, tool-runtime, and skill-runtime — never fail silently."""
    tools: Set[str] = set()
    connections: List[Dict[str, Any]] = list(manifest_connections or [])
    tool_schemas: List[Dict[str, Any]] = []
    available_caps: Set[str] = set(manifest_caps or set())
    warnings: List[str] = []

    if manifest_caps is None or manifest_connections is None:
        _, fetched_caps, fetched_connections = await fetch_integration_manifest(user_id)
        if manifest_caps is None:
            available_caps |= fetched_caps
        if manifest_connections is None:
            connections = list(fetched_connections)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            res = await client.get(
                f"{TOOL_RUNTIME_URL}/v1/tools/available",
                params={"userId": user_id},
            )
            if res.status_code == 200:
                data = res.json()
                tool_schemas = data.get("tools", [])
                tools = {t["function"]["name"] for t in tool_schemas if t.get("function")}
                if not connections:
                    connections = data.get("connections", [])
            else:
                warnings.append(f"tool-runtime tools/available: HTTP {res.status_code}")
        except Exception as exc:
            warnings.append(f"tool-runtime unreachable: {exc}")

        try:
            res = await client.get(
                f"{SKILL_RUNTIME_URL}/v1/tools/available",
                params={"userId": user_id},
            )
            if res.status_code == 200:
                data = res.json()
                for t in data.get("tools", []):
                    if t.get("function", {}).get("name"):
                        tools.add(t["function"]["name"])
                if not connections:
                    connections = data.get("connections", [])
            else:
                warnings.append(f"skill-runtime tools/available: HTTP {res.status_code}")
        except Exception as exc:
            warnings.append(f"skill-runtime unreachable: {exc}")

        try:
            cap_res = await client.get(
                f"{SKILL_RUNTIME_URL}/v1/capabilities",
                params={"userId": user_id},
            )
            if cap_res.status_code == 200:
                caps = cap_res.json().get("capabilities", [])
                available_caps |= {c["id"] for c in caps if c.get("id")}
        except Exception:
            pass

    if not available_caps:
        for cap_id, (_, tool) in CAPABILITY_TO_TOOL.items():
            if tool in tools:
                available_caps.add(cap_id)

    return tools, connections, tool_schemas, available_caps, warnings


async def _skill_planner_context() -> str:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(f"{SKILL_RUNTIME_URL}/v1/skills/catalog")
            if res.status_code == 200:
                return str(res.json().get("plannerContext", ""))
    except Exception:
        pass
    return ""


def _parse_llm_json(raw: str) -> Dict[str, Any]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except Exception:
        return {"capabilities": [], "tools": []}


def _extract_contact_name(query: str) -> str | None:
    patterns = [
        r"send(?:\s+a)?\s+message\s+to\s+([A-Za-z][\w\s'-]{0,40}?)(?:\s+[:,-]|\s+saying|\s*$)",
        r"text\s+([A-Za-z][\w'-]+)",
        r"message\s+([A-Za-z][\w'-]+)",
        r"whatsapp\s+([A-Za-z][\w'-]+)",
        r"to\s+([A-Za-z][\w'-]+)\s*[:,-]",
    ]
    for pattern in patterns:
        m = re.search(pattern, query, re.IGNORECASE)
        if m:
            name = m.group(1).strip()
            if name.lower() not in ("a", "the", "my", "on", "via", "whatsapp", "him", "her"):
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


def _connected_providers(connections: List[Dict[str, Any]]) -> Set[str]:
    return {str(c.get("providerId", "")) for c in connections if c.get("providerId")}


def _capability_allowed(
    cap_id: str,
    provider: str | None,
    available_caps: Set[str],
    connected: Set[str],
) -> bool:
    if cap_id in available_caps:
        return True
    if cap_id not in CAPABILITY_TO_TOOL:
        return False
    expected_prov, _ = CAPABILITY_TO_TOOL[cap_id]
    prov = provider or expected_prov
    return prov in connected or expected_prov in connected


def _heuristic_whatsapp_read(query: str, available_caps: Set[str]) -> List[Dict[str, Any]]:
    q = query.lower()
    messaging_intent = any(
        w in q
        for w in [
            "whatsapp",
            "wa ",
            "unread",
            "chats",
            "messages",
            "texts",
            "dm",
            "inbox",
        ]
    )
    action_intent = any(
        w in q
        for w in [
            "check",
            "new",
            "anything",
            "recent",
            "list",
            "show",
            "read",
            "search",
            "summarize",
            "summary",
            "catch up",
        ]
    )
    if not messaging_intent and not (action_intent and "message" in q):
        return []
    if not action_intent:
        return []

    if "messaging.list_unread" in available_caps:
        return [
            {
                "capability": "messaging.list_unread",
                "provider": "whatsapp",
                "args": {"limit": 20},
            }
        ]
    if "communication.chat.search" not in available_caps:
        return []
    search_q = ""
    for pattern in [
        r"from\s+([A-Za-z][\w'-]+)",
        r"chat\s+with\s+([A-Za-z][\w'-]+)",
        r"([A-Za-z][\w'-]+)'s\s+whatsapp",
    ]:
        m = re.search(pattern, query, re.IGNORECASE)
        if m:
            name = m.group(1)
            if name.lower() not in ("my", "the", "a", "whatsapp"):
                search_q = name
                break
    return [
        {
            "capability": "communication.chat.search",
            "provider": "whatsapp",
            "args": {"query": search_q},
        }
    ]


def _heuristic_email(query: str, available_caps: Set[str]) -> List[Dict[str, Any]]:
    q = query.lower()
    out: List[Dict[str, Any]] = []
    if not any(w in q for w in ["email", "gmail", "inbox", "mail"]):
        return out
    if any(w in q for w in ["unread", "new", "check", "summarize", "summary"]) and (
        "email.list_unread" in available_caps
    ):
        out.append(
            {
                "capability": "email.list_unread",
                "provider": "google",
                "args": {"maxResults": 15},
            }
        )
    if any(w in q for w in ["read", "latest", "last"]) and "email.read_email" in available_caps:
        out.append({"capability": "email.read_email", "provider": "google", "args": {}})
    return out


def _heuristic_calendar(query: str, available_caps: Set[str]) -> List[Dict[str, Any]]:
    q = query.lower()
    if "calendar.list_upcoming" not in available_caps:
        return []
    if any(
        w in q
        for w in ["meeting", "calendar", "schedule", "upcoming", "appointment", "events"]
    ):
        return [
            {
                "capability": "calendar.list_upcoming",
                "provider": "google",
                "args": {"maxResults": 10},
            }
        ]
    return []


def _heuristic_capabilities(
    query: str, available_caps: Set[str], connected: Set[str]
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    q = query.lower()
    has_whatsapp = "whatsapp" in connected

    out.extend(_heuristic_whatsapp_read(query, available_caps))
    out.extend(_heuristic_email(query, available_caps))
    out.extend(_heuristic_calendar(query, available_caps))

    send_intent = bool(
        re.search(r"\b(send|text)\b", q) or re.search(r"\bmessage\s+to\b", q)
    )
    if not send_intent and not (
        has_whatsapp and any(w in q for w in ["whatsapp", "wa ", "text", "message"])
    ):
        return out

    contact_hint = _extract_contact_name(query)
    if contact_hint and "communication.chat.search" in available_caps:
        out.append(
            {
                "capability": "communication.chat.search",
                "provider": "whatsapp",
                "args": {"query": contact_hint},
            }
        )

    send_cap = (
        "messaging.send_message"
        if "messaging.send_message" in available_caps
        else "communication.message.send"
    )
    if send_cap in available_caps:
        out.append(
            {
                "capability": send_cap,
                "provider": "whatsapp",
                "args": _parse_whatsapp_send_args(query),
            }
        )
    return out


def _heuristic_note_capabilities(query: str, available_caps: Set[str]) -> List[Dict[str, Any]]:
    q = query.lower()
    if not any(
        w in q
        for w in ["note", "remember", "save this", "save that", "write down", "jot down"]
    ):
        return []
    out: List[Dict[str, Any]] = []
    if "productivity.note.create" in available_caps and any(
        w in q for w in ["save", "remember", "note", "write down", "jot"]
    ):
        content = query
        if "saying" in q:
            parts = re.split(r"\bsaying\b", query, flags=re.IGNORECASE, maxsplit=1)
            if len(parts) > 1:
                content = parts[1].strip()
        out.append({"capability": "productivity.note.create", "args": {"content": content}})
    if "productivity.note.search" in available_caps and any(
        w in q for w in ["find note", "search note", "my notes"]
    ):
        out.append({"capability": "productivity.note.search", "args": {"query": query}})
    return out


def _capabilities_to_tools(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """If the planner chose a capability, always resolve to a tool for execution."""
    out: List[Dict[str, Any]] = []
    for raw in items:
        item = normalize_planned_item(dict(raw))
        if item.get("tool"):
            out.append(item)
    return out


def _build_plan_result(
    query: str,
    context: str,
    user_id: str,
    connections: List[Dict[str, Any]],
    tools: Set[str],
    cap_items: List[Dict[str, Any]],
    planner: str,
    warnings: List[str],
    model_used: str | None = None,
) -> Dict[str, Any]:
    return {
        "query": query,
        "context": context,
        "user_id": user_id,
        "capabilities": cap_items,
        "tools": _capabilities_to_tools(cap_items),
        "connections": connections,
        "available_tool_count": len(tools),
        "planner": planner,
        "model_used": model_used,
        "warnings": warnings,
    }


async def _llm_plan_capabilities(
    query: str,
    context: str,
    user_id: str,
    available_caps: Set[str],
    connected: Set[str],
    skill_docs: str,
) -> Tuple[List[Dict[str, Any]], str | None, List[str]]:
    warnings: List[str] = []
    planner_model = _planner_model()
    if not planner_model:
        warnings.append("No planner model configured")
        return [], None, warnings

    system = (
        "You are an agent that selects capabilities to accomplish the user's request.\n"
        "Return ONLY valid JSON with shape: "
        '{"capabilities":[{"capability":"messaging.list_unread","args":{},"provider":"whatsapp"}]}.\n'
        "Use only capability IDs listed in Context (connected apps section). "
        'If none needed, return {"capabilities":[]}.\n'
        "Domain capabilities: messaging.*, email.*, calendar.*, files.* — never legacy tool names.\n"
        "Prefer minimal steps. For WhatsApp unread use messaging.list_unread; for send use messaging.send_message.\n"
        "Before sending a message to a person by name, plan communication.chat.search first.\n"
        "If the user asks what is connected, answer from Context — do not invent integrations.\n"
    )

    user_prompt = (
        f"User query: {query}\n\n"
        f"Context:\n{context}\n\n"
        "Plan using only capability IDs from the Context above.\n\n"
    )
    if skill_docs:
        user_prompt += f"Skill manuals:\n{skill_docs[:12000]}\n\n"
    user_prompt += "JSON:"

    cap_items: List[Dict[str, Any]] = []
    model_used = None

    try:
        async with httpx.AsyncClient(timeout=PLANNER_COMPLETE_TIMEOUT) as client:
            res = await client.post(
                f"{AI_SERVICE_URL}/v1/chat/complete",
                json={
                    "query": user_prompt,
                    "rag_enabled": False,
                    "chat_history": [{"role": "system", "content": system}],
                    "user_id": user_id,
                    "task": "planner",
                },
            )
            res.raise_for_status()
            data = res.json()
            model_used = data.get("model_used")

        raw = str(data.get("text", "")).strip()
        planned = _parse_llm_json(raw)

        for item in planned.get("capabilities", []) if isinstance(planned, dict) else []:
            cap_id = item.get("capability")
            if not cap_id:
                continue
            if not _capability_allowed(
                cap_id, item.get("provider"), available_caps, connected
            ):
                continue
            args = item.get("args", {}) if isinstance(item.get("args", {}), dict) else {}
            provider = item.get("provider") or default_provider_for_capability(cap_id)
            cap_items.append(
                {
                    "capability": cap_id,
                    "provider": provider,
                    "args": args,
                }
            )

        if not cap_items and isinstance(planned, dict):
            for item in planned.get("tools", []):
                name = item.get("tool")
                if name:
                    args = (
                        item.get("args", {})
                        if isinstance(item.get("args", {}), dict)
                        else {}
                    )
                    cap_items.append({"tool": name, "args": args})
    except Exception as exc:
        warnings.append(f"LLM planner failed: {exc}")

    return cap_items, model_used, warnings


async def plan_tools(
    query: str,
    context: str,
    user_id: str,
    preferred_model: str | None = None,
    manifest_caps: Optional[Set[str]] = None,
    manifest_connections: Optional[List[Dict[str, Any]]] = None,
    routing_query: Optional[str] = None,
    timezone: Optional[str] = None,
) -> Dict[str, Any]:
    del preferred_model 

    from orchestration.reminder_planner import plan_reminder_action

    tools, connections, _, available_caps, warnings = await _available_tools(
        user_id,
        manifest_caps=manifest_caps,
        manifest_connections=manifest_connections,
    )
    connected = _connected_providers(connections)

    route_text = (routing_query or query).strip() or query
    full_prompt = (query or route_text).strip()
    reminder_items = plan_reminder_action(
        route_text,
        user_prompt=full_prompt,
        timezone=timezone,
    )
    if reminder_items:
        return _build_plan_result(
            query,
            context,
            user_id,
            connections,
            tools,
            reminder_items,
            "heuristic-reminder",
            warnings,
        )

    heuristic_items = _heuristic_capabilities(query, available_caps, connected)
    if not heuristic_items:
        heuristic_items = _heuristic_note_capabilities(query, available_caps)

    if heuristic_items:
        return _build_plan_result(
            query,
            context,
            user_id,
            connections,
            tools,
            heuristic_items,
            "heuristic",
            warnings,
        )

    if not is_likely_tool_query(query):
        return _build_plan_result(
            query,
            context,
            user_id,
            connections,
            tools,
            [],
            "conversational-skip",
            warnings,
        )

    skill_docs = await _skill_planner_context()
    cap_items, model_used, llm_warnings = await _llm_plan_capabilities(
        query, context, user_id, available_caps, connected, skill_docs
    )
    warnings.extend(llm_warnings)

    if not cap_items:
        cap_items = _heuristic_capabilities(query, available_caps, connected)
    if not cap_items:
        cap_items = _heuristic_note_capabilities(query, available_caps)

    return _build_plan_result(
        query,
        context,
        user_id,
        connections,
        tools,
        cap_items,
        "capability-llm",
        warnings,
        model_used,
    )
