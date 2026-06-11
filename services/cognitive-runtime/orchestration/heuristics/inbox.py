from __future__ import annotations

from typing import Any, Dict, List, Set

from orchestration.heuristics.whatsapp import whatsapp_unread_limit


def heuristic_inbox_check(
    query: str, available_caps: Set[str], connected: Set[str]
) -> List[Dict[str, Any]]:
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
    explicit_whatsapp = any(
        w in q for w in ["whatsapp", "wa ", "texts", "chats", "msg", "msgs"]
    )
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
                "args": {"limit": whatsapp_unread_limit(query)},
            }
        )
    return out
