"""Document-mode routing: classify attachment turns from short user intent, not file body."""

from __future__ import annotations

import os
import re

_READ_ONLY = re.compile(
    r"\b(?:"
    r"summarize|summary|explain|describe|analyze|analyse|"
    r"what(?:'s| is) in|what does (?:the |this )?(?:file|pdf|document) say|"
    r"check the file|read the (?:file|pdf|document)|"
    r"look at the (?:file|pdf|document)|see the (?:file|pdf|document)|"
    r"review (?:the |this )?(?:file|pdf|document)|"
    r"key (?:points|details|takeaways)"
    r")\b",
    re.IGNORECASE,
)

_INTEGRATION_ACTION = re.compile(
    r"(?:"
    r"\b(?:send|forward|share|post|upload)\b.{0,40}\b(?:email|gmail|whatsapp|calendar|drive)\b|"
    r"\b(?:send|forward|share|post)\b.{0,40}\b(?:to|via)\b|"
    r"\bschedule\b.{0,40}\b(?:meeting|calendar|event)\b|"
    r"\bcheck my (?:inbox|email|emails|calendar|whatsapp)\b|"
    r"\blist (?:my )?(?:unread )?(?:emails|messages)\b|"
    r"\bmessage (?:to|on) (?:whatsapp|wa)\b|"
    r"\bemail (?:this|the) (?:pdf|file|document) to\b"
    r")",
    re.IGNORECASE,
)


def _routing_max_chars() -> int:
    raw = os.getenv("ROUTING_QUERY_MAX_CHARS", "512")
    try:
        n = int(raw)
        return min(max(n, 64), 2000)
    except ValueError:
        return 512


def routing_intent_slice(query: str, max_chars: int | None = None) -> str:
    """First portion of user text used only for routing (not LLM context)."""
    limit = max_chars if max_chars is not None else _routing_max_chars()
    text = (query or "").strip()
    if not text:
        return ""
    # Prefer first paragraph when user pasted a long doc after a short instruction.
    para = text.split("\n\n", 1)[0].strip()
    if len(para) <= limit:
        return para
    return text[:limit]


def is_read_only_attachment_query(slice_text: str) -> bool:
    return bool(_READ_ONLY.search((slice_text or "").strip()))


def requires_integration_action(slice_text: str) -> bool:
    """Explicit integration action in the intent slice — not bare keywords in doc text."""
    s = (slice_text or "").strip()
    if not s:
        return False
    return bool(_INTEGRATION_ACTION.search(s))


def attachment_turn_needs_tools(query: str) -> bool:
    """True only when the user clearly wants an integration action on/with the attachment."""
    slice_text = routing_intent_slice(query)
    if is_read_only_attachment_query(slice_text):
        return False
    return requires_integration_action(slice_text)
