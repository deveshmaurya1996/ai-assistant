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
from orchestration.integration_intent import (
    is_connected_apps_query,
    is_read_intent,
    is_send_intent,
    resolve_integration_intent,
)

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
        "what apps are connected",
        "which apps are connected",
        "apps are connected",
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
        "check everything",
        "list my",
        "list unread",
        "show my",
        "read my",
        "search my",
        "summarize",
        "summary",
        "catch up",
        "catch me up",
        "anything new",
        "what did i miss",
        "remember this",
        "save this",
        "write down",
        "jot down",
        "find note",
        "my notes",
    ]
    return any(
        signal in q
        for signal in integration_signals + action_signals + file_signals
    )


def _healthy_provider_ids(connections: List[Dict[str, Any]]) -> Set[str]:
    return {str(c.get("providerId", "")) for c in connections if c.get("providerId")}


def _filter_caps_for_providers(
    cap_ids: Set[str], healthy_providers: Set[str]
) -> Set[str]:
    if not healthy_providers:
        return set()
    out: Set[str] = set()
    for cap_id in cap_ids:
        if cap_id not in CAPABILITY_TO_TOOL:
            continue
        expected_prov, _ = CAPABILITY_TO_TOOL[cap_id]
        if expected_prov in healthy_providers or expected_prov == "platform":
            out.add(cap_id)
        elif cap_id in ("drive.search", "drive.get_content"):
            if "google" in healthy_providers:
                out.add(cap_id)
        elif cap_id == "resources.search":
            out.add(cap_id)
    return out


async def _available_tools(
    user_id: str,
    manifest_caps: Optional[Set[str]] = None,
    manifest_connections: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[Set[str], List[Dict[str, Any]], List[Dict[str, Any]], Set[str], List[str]]:
    """Gateway health-filtered manifest is the source of truth for capabilities."""
    tools: Set[str] = set()
    connections: List[Dict[str, Any]] = list(manifest_connections or [])
    tool_schemas: List[Dict[str, Any]] = []
    available_caps: Set[str] = set(manifest_caps or set())
    warnings: List[str] = []
    using_manifest = manifest_caps is not None and manifest_connections is not None

    if not using_manifest:
        _, fetched_caps, fetched_connections, _ = await fetch_integration_manifest(user_id)
        available_caps |= fetched_caps
        connections = list(fetched_connections)

    healthy_providers = _healthy_provider_ids(connections)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            res = await client.get(
                f"{TOOL_RUNTIME_URL}/v1/tools/available",
                params={"userId": user_id},
            )
            if res.status_code == 200:
                data = res.json()
                tool_schemas = data.get("tools", [])
                all_tools = {t["function"]["name"] for t in tool_schemas if t.get("function")}
                if healthy_providers:
                    tools = {
                        name
                        for name in all_tools
                        if name.split(".")[0] in healthy_providers
                        or name.split(".")[0] in ("resources", "contacts", "reminder", "automation")
                    }
                else:
                    tools = set()
            else:
                warnings.append(f"tool-runtime tools/available: HTTP {res.status_code}")
        except Exception as exc:
            warnings.append(f"tool-runtime unreachable: {exc}")

    if not available_caps and healthy_providers:
        for cap_id, (_, tool) in CAPABILITY_TO_TOOL.items():
            if tool in tools:
                available_caps.add(cap_id)

    available_caps = _filter_caps_for_providers(available_caps, healthy_providers)

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


_CONTACT_STOP_WORDS = frozenset(
    {
        "a",
        "the",
        "my",
        "on",
        "via",
        "whatsapp",
        "him",
        "her",
        "unread",
        "check",
        "list",
        "show",
        "new",
        "recent",
        "messages",
        "message",
        "inbox",
        "chats",
    }
)


def _extract_contact_name(query: str) -> str | None:
    if not is_send_intent(query):
        return None
    patterns = [
        r"send(?:\s+a)?\s+message\s+to\s+([A-Za-z][\w\s'-]{0,40}?)(?:\s+[:,-]|\s+saying|\s*$)",
        r"text\s+([A-Za-z][\w'-]+)",
        r"message\s+to\s+([A-Za-z][\w'-]+)",
        r"to\s+([A-Za-z][\w'-]+)\s*[:,-]",
    ]
    for pattern in patterns:
        m = re.search(pattern, query, re.IGNORECASE)
        if m:
            name = m.group(1).strip()
            if name.lower() not in _CONTACT_STOP_WORDS:
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
    del provider, connected
    return cap_id in available_caps


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


def _heuristic_inbox_check(
    query: str, available_caps: Set[str], connected: Set[str]
) -> List[Dict[str, Any]]:
    """Plan unread fetches for generic inbox / important / catch-up requests."""
    q = query.lower()
    generic = any(
        w in q
        for w in [
            "inbox",
            "catch up",
            "important",
            "unread",
            "messages",
            "check my",
            "check the",
            "summarize",
            "summary",
        ]
    )
    if not generic:
        return []

    out: List[Dict[str, Any]] = []
    explicit_email = any(w in q for w in ["email", "gmail", "mail"])
    explicit_whatsapp = any(w in q for w in ["whatsapp", "wa ", "texts", "chats"])
    wants_email = explicit_email or (
        generic and "google" in connected and not explicit_whatsapp
    )
    wants_whatsapp = explicit_whatsapp or (
        generic and "whatsapp" in connected and not explicit_email
    )

    if wants_email and "email.list_unread" in available_caps:
        out.append(
            {
                "capability": "email.list_unread",
                "provider": "google",
                "args": {"maxResults": 15},
            }
        )
    if wants_whatsapp and "messaging.list_unread" in available_caps:
        out.append(
            {
                "capability": "messaging.list_unread",
                "provider": "whatsapp",
                "args": {"limit": 20},
            }
        )
    return out


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


_CONNECTED_APPS_SIGNALS = (
    "connected apps",
    "what is connected",
    "what's connected",
    "what apps are connected",
    "which apps are connected",
    "apps are connected",
    "what integrations",
    "which integrations",
)


def _is_connected_apps_query(query: str) -> bool:
    q = query.lower()
    return any(signal in q for signal in _CONNECTED_APPS_SIGNALS)


def _heuristic_connected_apps_query(query: str) -> bool:
    return is_connected_apps_query(query)


def _heuristic_drive(
    query: str, available_caps: Set[str], connected: Set[str]
) -> List[Dict[str, Any]]:
    q = query.lower()
    drive_signals = [
        "google drive",
        "my drive",
        "in drive",
        "on drive",
        "drive file",
        "drive document",
        "drive doc",
        "google doc",
        "google sheet",
        "search my documents",
        "find my document",
        "find my file",
        "my document",
        "my spreadsheet",
        "drive",
    ]
    if not any(w in q for w in drive_signals):
        return []
    if "google" not in connected:
        return []

    out: List[Dict[str, Any]] = []
    search_q = query
    if "drive.search" in available_caps:
        out.append(
            {
                "capability": "drive.search",
                "provider": "google",
                "args": {"query": search_q, "maxResults": 10},
            }
        )
    return out


def _heuristic_calendar(query: str, available_caps: Set[str]) -> List[Dict[str, Any]]:
    q = query.lower()
    if re.search(r"\b(remind|reminder|notify me)\b", q):
        return []
    if any(
        w in q
        for w in ["inbox", "remind", "reminder", "summarize", "summary", "catch up", "important"]
    ):
        return []
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


def _dedupe_cap_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: Set[str] = set()
    out: List[Dict[str, Any]] = []
    for item in items:
        key = str(item.get("capability") or item.get("tool") or "")
        if key:
            if key in seen:
                continue
            seen.add(key)
        out.append(item)
    return out


def _heuristic_capabilities(
    query: str, available_caps: Set[str], connected: Set[str]
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    q = query.lower()
    has_whatsapp = "whatsapp" in connected

    out.extend(_heuristic_inbox_check(query, available_caps, connected))
    out.extend(_heuristic_whatsapp_read(query, available_caps))
    out.extend(_heuristic_email(query, available_caps))
    out.extend(_heuristic_calendar(query, available_caps))
    out.extend(_heuristic_drive(query, available_caps, connected))
    out = _dedupe_cap_items(out)

    if not is_send_intent(query) or is_read_intent(query):
        return out

    contact_hint = _extract_contact_name(query)
    search_cap = (
        "messaging.search_chats"
        if "messaging.search_chats" in available_caps
        else "communication.chat.search"
    )
    if contact_hint and search_cap in available_caps:
        out.append(
            {
                "capability": search_cap,
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
    return _dedupe_cap_items(out)


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
    user_guidance: str | None = None,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
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
    if user_guidance:
        result["user_guidance"] = user_guidance
    return result


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
        "Scheduling/reminders/automations are handled by a dedicated planner — do not plan them here.\n"
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
    manifest_connection_states: Optional[List[Dict[str, Any]]] = None,
    routing_query: Optional[str] = None,
    timezone: Optional[str] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    del preferred_model 

    from orchestration.scheduling_planner import (
        _looks_like_scheduling_query,
        plan_scheduling_actions,
        should_run_scheduling_planner,
    )

    connection_states = list(manifest_connection_states or [])
    if not connection_states:
        _, _, fetched_connections, fetched_states = await fetch_integration_manifest(
            user_id
        )
        if fetched_states:
            connection_states = fetched_states
        elif fetched_connections:
            connection_states = [
                {"providerId": c.get("providerId"), "state": "ready"}
                for c in fetched_connections
                if c.get("providerId")
            ]

    tools, connections, _, available_caps, warnings = await _available_tools(
        user_id,
        manifest_caps=manifest_caps,
        manifest_connections=manifest_connections,
    )
    connected = _connected_providers(connections)

    route_text = (routing_query or query).strip() or query
    history = chat_history or []

    if _heuristic_connected_apps_query(query):
        return _build_plan_result(
            query,
            context,
            user_id,
            connections,
            tools,
            [],
            "connected-apps-info",
            warnings,
        )

    integration_intent = resolve_integration_intent(query, connection_states)
    if integration_intent.user_guidance and integration_intent.action == "execute":
        warnings.append(integration_intent.user_guidance)

    if integration_intent.action == "unsupported_prompt":
        return _build_plan_result(
            query,
            context,
            user_id,
            connections,
            tools,
            [],
            "integration-unsupported",
            warnings,
            user_guidance=integration_intent.user_guidance,
        )

    if integration_intent.action in ("connect_prompt", "offline_prompt"):
        return _build_plan_result(
            query,
            context,
            user_id,
            connections,
            tools,
            [],
            "integration-blocked",
            warnings,
            user_guidance=integration_intent.user_guidance,
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

    if should_run_scheduling_planner(route_text, history):
        schedule_items, clarification, scheduling_intent, schedule_warnings = (
            await plan_scheduling_actions(
                route_text,
                user_id=user_id,
                chat_history=history,
                timezone=timezone,
            )
        )
        warnings.extend(schedule_warnings)

        if clarification:
            warnings.append(clarification)
            return _build_plan_result(
                query,
                context,
                user_id,
                connections,
                tools,
                [],
                "llm-scheduling-clarification",
                warnings,
            )

        if schedule_items:
            return _build_plan_result(
                query,
                context,
                user_id,
                connections,
                tools,
                schedule_items,
                "llm-scheduling",
                warnings,
            )

        if scheduling_intent:
            warnings.append(
                "Scheduling planner did not produce a schedule — "
                "the assistant should ask the user to rephrase or try again."
            )
            return _build_plan_result(
                query,
                context,
                user_id,
                connections,
                tools,
                [],
                "llm-scheduling-empty",
                warnings,
            )

    if not is_likely_tool_query(query) and not _looks_like_scheduling_query(
        route_text, history
    ):
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

    if _looks_like_scheduling_query(route_text, history) and not is_likely_tool_query(
        query
    ):
        warnings.append(
            "Scheduling follow-up did not produce a schedule — ask the user to rephrase."
        )
        return _build_plan_result(
            query,
            context,
            user_id,
            connections,
            tools,
            [],
            "llm-scheduling-empty",
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
