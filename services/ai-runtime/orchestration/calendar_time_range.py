from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

try:
    from zoneinfo import ZoneInfo
except ImportError: 
    ZoneInfo = None


def _resolve_tz(timezone: Optional[str]):
    if ZoneInfo is None:
        return None
    for candidate in (timezone, "UTC"):
        if not candidate:
            continue
        try:
            return ZoneInfo(candidate.strip())
        except Exception:
            continue
    return None


def resolve_calendar_time_range(
    query: str, timezone: Optional[str] = None
) -> Optional[Dict[str, str]]:
    q = (query or "").lower()
    tz = _resolve_tz(timezone)
    if tz is None:
        return None

    now = datetime.now(tz)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if re.search(r"\byesterday\b", q):
        start = today_start - timedelta(days=1)
        end = today_start
        return _range_payload(start, end, "yesterday")

    if re.search(r"\btomorrow\b", q):
        start = today_start + timedelta(days=1)
        end = start + timedelta(days=1)
        return _range_payload(start, end, "tomorrow")

    if re.search(r"\btoday\b", q):
        start = today_start
        end = today_start + timedelta(days=1)
        return _range_payload(start, end, "today")

    return None


def _range_payload(start: datetime, end: datetime, label: str) -> Dict[str, str]:
    return {
        "timeMin": start.isoformat(timespec="seconds"),
        "timeMax": end.isoformat(timespec="seconds"),
        "rangeLabel": label,
    }
