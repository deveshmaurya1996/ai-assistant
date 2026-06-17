
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from orchestration.integration_intent import (
    _detect_supported_providers,
    is_read_intent,
    is_send_intent,
)
from orchestration.signals import is_likely_tool_query

ABSTRACT_TO_CATALOG: Dict[str, List[str]] = {
    "search_messages": [
        "messaging.list_unread",
        "messaging.read_chat",
        "messaging.search_messages",
        "messaging.search_chats",
        "email.list_unread",
        "email.search",
        "email.read_email",
    ],
    "search_events": ["calendar.list_upcoming"],
    "search_documents": ["drive.search", "resources.search"],
    "send_message": ["messaging.send_message", "email.send_email"],
    "read_file": ["drive.get_content", "email.read_email"],
    "create_event": ["calendar.create_event"],
    "cancel_event": ["calendar.cancel_event"],
}

_IMPLICIT_MESSAGE_SIGNALS = (
    "reply",
    "replied",
    "respond",
    "said",
    "send",
    "sent",
    "message from",
    "text from",
    "wrote",
    "tell me what",
    "what did",
    "did ",
    "anything from",
)

_CALENDAR_SIGNALS = (
    "meeting",
    "calendar",
    "schedule",
    "appointment",
    "event",
    "free",
    "busy",
    "available",
)

_TEMPORAL_WORDS = (
    "today",
    "tomorrow",
    "yesterday",
    "morning",
    "afternoon",
    "evening",
    "tonight",
    "this week",
    "next week",
)

_TOOL_RESULT_MARKERS = (
    "[System: tool actions completed]",
    "[System: integration guidance]",
    "Reminder scheduled:",
)


@dataclass
class TurnIntentPlan:
    needs_live_data: bool = False
    abstract_capabilities: List[str] = field(default_factory=list)
    entities: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    primary_intent: str = "conversational"


def _extract_person(query: str) -> Optional[str]:
    patterns = [
        r"(?:from|with|to)\s+([A-Z][a-zA-Z'-]+)",
        r"(?:did|has)\s+([A-Z][a-zA-Z'-]+)\s+(?:reply|respond|say|send|write)",
        r"([A-Z][a-zA-Z'-]+)(?:'s)?\s+(?:reply|message|email|text)",
    ]
    for pattern in patterns:
        match = re.search(pattern, query)
        if match:
            name = match.group(1).strip()
            if name.lower() not in ("i", "my", "the", "a", "an", "what", "did", "has"):
                return name
    return None


def _extract_temporal(query: str) -> Optional[str]:
    lower = query.lower()
    for word in _TEMPORAL_WORDS:
        if word in lower:
            return word
    date_match = re.search(
        r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        lower,
    )
    if date_match:
        return date_match.group(1)
    return None


def _is_integration_followup(chat_history: List[Dict[str, str]]) -> bool:
    for msg in reversed(chat_history):
        if msg.get("role") != "assistant":
            continue
        content = str(msg.get("content") or "")
        return any(marker in content for marker in _TOOL_RESULT_MARKERS)
    return False


def _infer_abstract_capabilities(query: str) -> List[str]:
    lower = query.lower()
    caps: List[str] = []

    if is_send_intent(query):
        caps.append("send_message")
    elif any(s in lower for s in _IMPLICIT_MESSAGE_SIGNALS) or is_read_intent(query):
        caps.append("search_messages")
    elif _detect_supported_providers(query) or is_likely_tool_query(query):
        if any(s in lower for s in _CALENDAR_SIGNALS):
            if any(w in lower for w in ("cancel", "delete", "remove")):
                caps.extend(["search_events", "cancel_event"])
            elif any(w in lower for w in ("create", "schedule", "book", "add")):
                caps.append("create_event")
            else:
                caps.append("search_events")
        if any(s in lower for s in ("drive", "file", "document", "spreadsheet", "pdf")):
            if any(w in lower for w in ("read", "summarize", "content", "open")):
                caps.extend(["search_documents", "read_file"])
            else:
                caps.append("search_documents")
        if not caps and any(
            s in lower
            for s in ("whatsapp", "gmail", "email", "inbox", "mail", "message")
        ):
            caps.append("search_messages")

    if any(s in lower for s in _CALENDAR_SIGNALS) and "search_events" not in caps:
        if not any(w in lower for w in ("remind", "reminder")):
            caps.append("search_events")

    if "?" in query and any(t in lower for t in _TEMPORAL_WORDS):
        if "search_events" not in caps and not any(
            w in lower for w in ("remind", "reminder")
        ):
            caps.append("search_events")

    seen: set[str] = set()
    out: List[str] = []
    for cap in caps:
        if cap not in seen:
            seen.add(cap)
            out.append(cap)
    return out


def infer_turn_intent(
    query: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> TurnIntentPlan:
    """Classify whether a turn requires live integration data before answering."""
    q = (query or "").strip()
    history = chat_history or []
    lower = q.lower()

    if not q:
        return TurnIntentPlan()

    abstract_caps = _infer_abstract_capabilities(q)
    entities: Dict[str, Any] = {}
    person = _extract_person(q)
    temporal = _extract_temporal(q)
    if person:
        entities["person"] = person
    if temporal:
        entities["date"] = temporal

    needs_live = bool(abstract_caps) or is_likely_tool_query(q)

    if not needs_live and _is_integration_followup(history):
        needs_live = True
        abstract_caps = abstract_caps or ["search_messages"]
        entities.setdefault("followup", True)

    if not needs_live and "?" in q and len(q) > 12:
        if any(s in lower for s in _IMPLICIT_MESSAGE_SIGNALS + _CALENDAR_SIGNALS):
            needs_live = True
            if not abstract_caps:
                abstract_caps = ["search_messages"]

    confidence = 0.9 if abstract_caps else (0.7 if needs_live else 0.3)
    primary = abstract_caps[0] if abstract_caps else (
        "integration" if needs_live else "conversational"
    )

    return TurnIntentPlan(
        needs_live_data=needs_live,
        abstract_capabilities=abstract_caps,
        entities=entities,
        confidence=confidence,
        primary_intent=primary,
    )


def catalog_capabilities_for_abstract(abstract_cap: str) -> List[str]:
    return list(ABSTRACT_TO_CATALOG.get(abstract_cap, []))


def resolve_abstract_to_catalog(abstract_caps: List[str]) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for abstract in abstract_caps:
        for cap_id in catalog_capabilities_for_abstract(abstract):
            if cap_id not in seen:
                seen.add(cap_id)
                out.append(cap_id)
    return out
