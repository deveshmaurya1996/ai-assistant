from __future__ import annotations

import re
from typing import Any, Dict, List, Set

from orchestration.integration_intent import is_email_send_intent


def extract_email_address(query: str) -> str | None:
    match = re.search(r"[\w.+-]+@[\w.-]+\.\w+", query)
    return match.group(0) if match else None


def parse_email_send_args(query: str) -> Dict[str, str]:
    to = extract_email_address(query) or ""
    subject = ""
    body = ""

    subject_match = re.search(
        r'\bsubject\s+["\']([^"\']+)["\']'
        r'|\bsubject\s+(.+?)(?:\s+and\s+(?:body|message)\b|\s+with\s+(?:body|message)\b|\s*$)',
        query,
        re.IGNORECASE,
    )
    if subject_match:
        subject = (subject_match.group(1) or subject_match.group(2) or "").strip().strip('"\'')

    body_match = re.search(
        r'\b(?:body|message|saying)\s+["\']([^"\']+)["\']'
        r'|\b(?:body|message|saying)\s+(.+)$',
        query,
        re.IGNORECASE,
    )
    if body_match:
        body = (body_match.group(1) or body_match.group(2) or "").strip().strip('"\'')

    return {"to": to, "subject": subject, "body": body, "message": body}


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


def heuristic_email_send(query: str, available_caps: Set[str]) -> List[Dict[str, Any]]:
    if not is_email_send_intent(query):
        return []
    if "email.send_email" not in available_caps:
        return []
    return [
        {
            "capability": "email.send_email",
            "provider": "google",
            "args": parse_email_send_args(query),
        }
    ]
