from __future__ import annotations

import re
from typing import Any, Dict, List, Set


def extract_drive_search_query(query: str) -> str:
    q = query.strip()
    patterns = [
        r"^(?:search|find)\s+my\s+(?:google\s+)?drive\s+for\s+(.+)$",
        r"^(?:search|find)\s+(?:google\s+)?drive\s+for\s+(.+)$",
        r"^(?:search|find)\s+(.+?)\s+in\s+(?:my\s+)?(?:google\s+)?drive$",
        r"^(?:find|search)\s+my\s+(.+?)\s+in\s+(?:google\s+)?drive$",
    ]
    for pattern in patterns:
        match = re.match(pattern, q, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return q


def heuristic_drive_get_content(
    query: str, available_caps: Set[str], connected: Set[str]
) -> List[Dict[str, Any]]:
    q = query.lower()
    if "google" not in connected:
        return []
    read_signals = ["read", "open", "summarize", "summary", "content", "show me"]
    if not any(w in q for w in read_signals):
        return []
    if not any(w in q for w in ["drive", "document", "file", "spreadsheet", "doc"]):
        return []
    out: List[Dict[str, Any]] = []
    search_q = extract_drive_search_query(query)
    if "drive.search" in available_caps:
        out.append(
            {
                "capability": "drive.search",
                "provider": "google",
                "args": {"query": search_q, "maxResults": 5},
            }
        )
    if "drive.get_content" in available_caps:
        out.append(
            {
                "capability": "drive.get_content",
                "provider": "google",
                "args": {"fileId": search_q},
            }
        )
    return out


def heuristic_drive(
    query: str, available_caps: Set[str], connected: Set[str]
) -> List[Dict[str, Any]]:
    q = query.lower()
    drive_signals = [
        "google drive",
        "my drive",
        "in drive",
        "on drive",
        "drive file",
        "drive document",
        "drive doc",
        "google doc",
        "google sheet",
        "search my documents",
        "find my document",
        "find my file",
        "my document",
        "my spreadsheet",
        "drive",
    ]
    if not any(w in q for w in drive_signals):
        return []
    if "google" not in connected:
        return []

    out: List[Dict[str, Any]] = []
    search_q = extract_drive_search_query(query)
    if "drive.search" in available_caps:
        out.append(
            {
                "capability": "drive.search",
                "provider": "google",
                "args": {"query": search_q, "maxResults": 10},
            }
        )
    return out
