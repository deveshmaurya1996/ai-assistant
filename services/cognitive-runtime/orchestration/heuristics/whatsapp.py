from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

from orchestration.integration_intent import is_read_intent, is_send_intent

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


def whatsapp_unread_limit(query: str) -> int:
    q = query.lower()
    if re.search(r"\b(all|every|entire|complete)\b", q):
        return 50
    return 20


def looks_like_phone(value: str) -> bool:
    digits = re.sub(r"\D", "", value)
    return len(digits) >= 10


def extract_contact_name(query: str) -> str | None:
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


def parse_whatsapp_send_args(query: str) -> Dict[str, str]:
    contact = extract_contact_name(query) or "contact"
    message = query
    colon = re.search(r"[:,-]\s*(.+)$", query)
    if colon:
        message = colon.group(1).strip()
    elif "saying" in query.lower():
        parts = re.split(r"\bsaying\b", query, flags=re.IGNORECASE, maxsplit=1)
        if len(parts) > 1:
            message = parts[1].strip()
    return {"to": contact, "message": message}


def extract_whatsapp_read_contact(query: str) -> Optional[str]:
    q = query.strip()
    action = r"(?:check|read|show|open|see|view|get|tell|what)"
    msg_word = r"(?:msg|msgs|message|messages|chat|chats)"
    patterns = [
        rf"{action}\s+(?:the\s+)?(?:my\s+)?(?:whatsapp\s+)?(?:personal\s+|private\s+)?{msg_word}\s+(?:from|with)\s+(.+)$",
        rf"{action}\s+(?:the\s+)?(?:whatsapp\s+)?{msg_word}\s+(?:from|with)\s+(.+)$",
        rf"{action}\s+(?:the\s+)?(?:whatsapp\s+)?(?:from|with)\s+(.+)$",
        rf"(?:any\s+)?new\s+{msg_word}\s+(?:from|with)\s+(.+)$",
        r"(?:personal|private)\s+(?:msg|msgs|message|messages)\s+(?:from|with)\s+(.+)$",
        rf"{msg_word}\s+(?:from|with)\s+(.+)$",
    ]
    skip_contacts = frozenset({"my", "the", "a", "whatsapp", "wa", "unread", "all"})
    for pattern in patterns:
        match = re.search(pattern, q, re.IGNORECASE)
        if not match:
            continue
        contact = match.group(1).strip().rstrip("?.!")
        if contact.lower() not in skip_contacts:
            return contact
    return None


def heuristic_whatsapp_read_personal(
    query: str, available_caps: Set[str]
) -> List[Dict[str, Any]]:
    contact = extract_whatsapp_read_contact(query)
    if not contact:
        return []

    out: List[Dict[str, Any]] = []
    needs_search = not looks_like_phone(contact) and "@" not in contact
    if needs_search and "messaging.search_chats" in available_caps:
        out.append(
            {
                "capability": "messaging.search_chats",
                "provider": "whatsapp",
                "args": {"query": contact},
            }
        )
    if "messaging.read_chat" in available_caps:
        out.append(
            {
                "capability": "messaging.read_chat",
                "provider": "whatsapp",
                "args": {"chatId": contact, "limit": 25},
            }
        )
    return out


def heuristic_whatsapp_read(query: str, available_caps: Set[str]) -> List[Dict[str, Any]]:
    q = query.lower()
    messaging_intent = any(
        w in q
        for w in [
            "whatsapp",
            "wa ",
            "unread",
            "chats",
            "messages",
            "message",
            "msg",
            "msgs",
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
                "args": {"limit": whatsapp_unread_limit(query)},
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


def heuristic_whatsapp_send(
    query: str, available_caps: Set[str]
) -> List[Dict[str, Any]]:
    if not is_send_intent(query) or is_read_intent(query):
        return []

    out: List[Dict[str, Any]] = []
    contact_hint = extract_contact_name(query)
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
                "args": parse_whatsapp_send_args(query),
            }
        )
    return out
