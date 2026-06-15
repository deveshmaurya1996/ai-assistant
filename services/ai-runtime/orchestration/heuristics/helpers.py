from __future__ import annotations

from typing import Any, Dict, List, Set


def connected_providers(connections: List[Dict[str, Any]]) -> Set[str]:
    return {str(c.get("providerId", "")) for c in connections if c.get("providerId")}


def dedupe_cap_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: Set[str] = set()
    out: List[Dict[str, Any]] = []
    for item in items:
        key = str(item.get("capability") or item.get("tool") or "")
        if key:
            if key in seen:
                continue
            seen.add(key)
        out.append(item)
    return out
