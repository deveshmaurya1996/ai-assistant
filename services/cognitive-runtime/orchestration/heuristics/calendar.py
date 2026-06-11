from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

from orchestration.calendar_time_range import resolve_calendar_time_range


def heuristic_calendar_cancel(
    query: str, available_caps: Set[str], connected: Set[str]
) -> List[Dict[str, Any]]:
    q = query.lower()
    if "google" not in connected:
        return []
    if not any(w in q for w in ["cancel", "delete", "remove"]):
        return []
    if not any(w in q for w in ["meeting", "event", "calendar", "appointment"]):
        return []
    if "calendar.list_upcoming" not in available_caps:
        return []
    out: List[Dict[str, Any]] = [
        {
            "capability": "calendar.list_upcoming",
            "provider": "google",
            "args": {"maxResults": 25},
        }
    ]
    if "calendar.cancel_event" in available_caps:
        out.append(
            {
                "capability": "calendar.cancel_event",
                "provider": "google",
                "args": {},
            }
        )
    return out


def heuristic_calendar(
    query: str, available_caps: Set[str], timezone: Optional[str] = None
) -> List[Dict[str, Any]]:
    q = query.lower()
    if re.search(r"\b(remind|reminder|notify me)\b", q):
        return []
    if any(
        w in q
        for w in ["inbox", "remind", "reminder", "summarize", "summary", "catch up", "important"]
    ):
        return []
    if "calendar.list_upcoming" not in available_caps:
        return []
    calendar_signals = [
        "meeting",
        "calendar",
        "schedule",
        "upcoming",
        "appointment",
        "events",
        "yesterday",
        "today",
        "tomorrow",
    ]
    if not any(w in q for w in calendar_signals):
        return []

    args: Dict[str, Any] = {"maxResults": 25}
    time_range = resolve_calendar_time_range(query, timezone)
    if time_range:
        args.update(time_range)

    return [
        {
            "capability": "calendar.list_upcoming",
            "provider": "google",
            "args": args,
        }
    ]
