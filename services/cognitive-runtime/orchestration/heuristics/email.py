from __future__ import annotations

from typing import Any, Dict, List, Set


def heuristic_email(query: str, available_caps: Set[str]) -> List[Dict[str, Any]]:
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
