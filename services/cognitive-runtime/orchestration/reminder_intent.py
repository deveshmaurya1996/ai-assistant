
from __future__ import annotations

import re

_EXPLICIT_REMIND = re.compile(
    r"\b("
    r"remind\s+me|"
    r"set\s+(?:a\s+)?reminder|"
    r"set\s+reminder|"
    r"need\s+(?:you\s+)?to\s+set\s+(?:a\s+)?reminder|"
    r"create\s+(?:a\s+)?reminder|"
    r"schedule\s+(?:a\s+)?reminder|"
    r"notify\s+me\s+(?:at|when)|"
    r"ping\s+me\s+at|"
    r"don'?t\s+let\s+me\s+forget|"
    r"alarm\s+me|"
    r"wake\s+me\s+up|"
    r"nudge\s+me"
    r")\b",
    re.IGNORECASE,
)

_TIME_CUE = re.compile(
    r"\b("
    r"at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|"
    r"tomorrow|"
    r"next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)|"
    r"in\s+\d+\s+(?:min(?:ute)?s?|hours?|days?)|"
    r"every\s+(?:\d+\s*)?(?:min(?:ute)?s?|hours?|hour|day|days?|week|weekday|morning|evening)"
    r")\b",
    re.IGNORECASE,
)

_TIMED_ACTION = re.compile(
    r"\b(?:call|text|email|meet|visit|take|pick\s+up|drink)\b.+\b(?:at|by|every)\b",
    re.IGNORECASE,
)

_TIME_THEN_ACTION = re.compile(
    r"\b(?:at|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b.+\b(?:call|text|email|meet|visit)\b",
    re.IGNORECASE,
)


def is_timed_remind_intent(text: str) -> bool:
    """True when the user wants a scheduled notification, not calendar booking."""
    trimmed = (text or "").strip()
    if not trimmed:
        return False
    if _EXPLICIT_REMIND.search(trimmed):
        return True
    if _TIMED_ACTION.search(trimmed) or _TIME_THEN_ACTION.search(trimmed):
        return True
    if re.search(r"\bremind\b", trimmed, re.IGNORECASE) and _TIME_CUE.search(trimmed):
        return True
    return False
