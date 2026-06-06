from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

try:
    from zoneinfo import ZoneInfo
except ImportError: 
    ZoneInfo = None 

_RELATIVE_MINUTES_RE = re.compile(
    r"\b(?:in|after)\s+(\d+)\s*(?:min(?:ute)?s?)\b",
    re.IGNORECASE,
)
_RELATIVE_ONE_MINUTE_RE = re.compile(
    r"\b(?:in|after)\s+(?:a|one)\s+min(?:ute)?\b",
    re.IGNORECASE,
)


def parse_relative_minutes(text: str) -> Optional[int]:
    raw = (text or "").strip()
    if not raw:
        return None
    if _RELATIVE_ONE_MINUTE_RE.search(raw):
        return 1
    match = _RELATIVE_MINUTES_RE.search(raw)
    if not match:
        return None
    try:
        minutes = int(match.group(1))
    except ValueError:
        return None
    return minutes if minutes > 0 else None


def resolve_one_shot_next_fire_at(user_prompt: str, timezone: str) -> Optional[str]:
    minutes = parse_relative_minutes(user_prompt)
    if minutes is None:
        return None
    if ZoneInfo is None:
        return None
    try:
        tz = ZoneInfo(timezone)
    except Exception:
        return None
    fire = datetime.now(tz) + timedelta(minutes=minutes)
    return fire.isoformat(timespec="seconds")
