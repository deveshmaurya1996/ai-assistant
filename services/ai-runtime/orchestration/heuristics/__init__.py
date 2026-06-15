from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from orchestration.heuristics.calendar import (
    heuristic_calendar,
    heuristic_calendar_cancel,
)
from orchestration.heuristics.drive import heuristic_drive, heuristic_drive_get_content
from orchestration.heuristics.email import heuristic_email
from orchestration.heuristics.helpers import dedupe_cap_items
from orchestration.heuristics.inbox import heuristic_inbox_check
from orchestration.heuristics.whatsapp import (
    heuristic_whatsapp_read,
    heuristic_whatsapp_read_personal,
    heuristic_whatsapp_send,
)


def run_heuristics(
    query: str,
    available_caps: Set[str],
    connected: Set[str],
    timezone: Optional[str] = None,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    personal_read = heuristic_whatsapp_read_personal(query, available_caps)
    if personal_read:
        out.extend(personal_read)
    else:
        out.extend(heuristic_inbox_check(query, available_caps, connected))
        out.extend(heuristic_whatsapp_read(query, available_caps))
    out.extend(heuristic_email(query, available_caps))

    cancel_items = heuristic_calendar_cancel(query, available_caps, connected)
    if cancel_items:
        out.extend(cancel_items)
    else:
        out.extend(heuristic_calendar(query, available_caps, timezone))

    drive_read = heuristic_drive_get_content(query, available_caps, connected)
    if drive_read:
        out.extend(drive_read)
    else:
        out.extend(heuristic_drive(query, available_caps, connected))

    out.extend(heuristic_whatsapp_send(query, available_caps))
    return dedupe_cap_items(out)


__all__ = [
    "run_heuristics",
    "dedupe_cap_items",
]
