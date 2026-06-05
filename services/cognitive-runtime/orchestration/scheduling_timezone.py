from __future__ import annotations

import re
from typing import Dict, List, Optional

_TIMEZONE_ALIASES: Dict[str, str] = {
    "ist": "Asia/Kolkata",
    "india": "Asia/Kolkata",
    "indian standard time": "Asia/Kolkata",
    "india standard time": "Asia/Kolkata",
    "pst": "America/Los_Angeles",
    "pdt": "America/Los_Angeles",
    "pacific": "America/Los_Angeles",
    "pacific time": "America/Los_Angeles",
    "est": "America/New_York",
    "edt": "America/New_York",
    "eastern": "America/New_York",
    "eastern time": "America/New_York",
    "cst": "America/Chicago",
    "cdt": "America/Chicago",
    "central": "America/Chicago",
    "central time": "America/Chicago",
    "mst": "America/Denver",
    "mdt": "America/Denver",
    "mountain": "America/Denver",
    "gmt": "Europe/London",
    "bst": "Europe/London",
    "utc": "UTC",
    "cet": "Europe/Paris",
    "aest": "Australia/Sydney",
    "aedt": "Australia/Sydney",
    "jst": "Asia/Tokyo",
    "kst": "Asia/Seoul",
    "sgt": "Asia/Singapore",
    "hkt": "Asia/Hong_Kong",
    "dubai": "Asia/Dubai",
    "uae": "Asia/Dubai",
}

_IANA_TZ = re.compile(r"^[A-Za-z]+(?:/[A-Za-z_+-]+)+$")


def resolve_timezone_hint(text: str) -> Optional[str]:
    raw = (text or "").strip()
    if not raw:
        return None

    if _IANA_TZ.match(raw) and "/" in raw:
        return raw

    lower = raw.lower().strip(".,!? ")
    if lower in _TIMEZONE_ALIASES:
        return _TIMEZONE_ALIASES[lower]

    for phrase, iana in _TIMEZONE_ALIASES.items():
        if len(phrase) >= 4 and phrase in lower:
            return iana

    offset = re.search(r"\bUTC([+-]\d{1,2}(?::\d{2})?)\b", raw, re.IGNORECASE)
    if offset:
        return f"UTC{offset.group(1)}"

    return None


def resolve_effective_timezone(
    device_timezone: Optional[str],
    query: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    device = (device_timezone or "").strip()
    if device:
        resolved = resolve_timezone_hint(device)
        return resolved or device

    from_query = resolve_timezone_hint(query)
    if from_query:
        return from_query

    for msg in reversed(chat_history or []):
        if msg.get("role") != "user":
            continue
        hint = resolve_timezone_hint(str(msg.get("content") or ""))
        if hint:
            return hint

    return None
