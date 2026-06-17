
from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any, Dict, List, Optional, Set

from orchestration.intent_classifier import ABSTRACT_TO_CATALOG

_MANIFEST_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "capability_manifest.json",
)


@lru_cache(maxsize=1)
def _load_manifest_caps() -> List[Dict[str, Any]]:
    try:
        with open(_MANIFEST_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return list(data.get("capabilities") or [])
    except OSError:
        return []


def catalog_for_abstract(abstract_cap: str) -> List[str]:
    manifest_ids = [
        str(c.get("id"))
        for c in _load_manifest_caps()
        if c.get("abstractCapability") == abstract_cap and c.get("plannerVisible")
    ]
    if manifest_ids:
        return manifest_ids
    return list(ABSTRACT_TO_CATALOG.get(abstract_cap, []))


def _provider_for_capability(cap_id: str) -> Optional[str]:
    for cap in _load_manifest_caps():
        if cap.get("id") != cap_id:
            continue
        providers = cap.get("providers") or []
        if providers:
            return str(providers[0].get("providerId"))
    if cap_id.startswith(("email.", "calendar.", "drive.")):
        return "google"
    if cap_id.startswith("messaging."):
        return "whatsapp"
    return None


def _provider_ready(provider_id: str, connection_states: List[Dict[str, Any]]) -> bool:
    for row in connection_states:
        if row.get("providerId") == provider_id:
            return str(row.get("state", "not_connected")) == "ready"
    return provider_id == "platform"


def resolve_tools(
    abstract_caps: List[str],
    available_caps: Set[str],
    connection_states: Optional[List[Dict[str, Any]]] = None,
    entities: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Map abstract capabilities to planner items using catalog priority."""
    connection_states = connection_states or []
    entities = entities or {}
    manifest_by_abstract: Dict[str, List[Dict[str, Any]]] = {}
    for cap in _load_manifest_caps():
        abstract = cap.get("abstractCapability")
        if not abstract:
            continue
        manifest_by_abstract.setdefault(str(abstract), []).append(cap)

    items: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for abstract in abstract_caps:
        candidates = sorted(
            manifest_by_abstract.get(abstract, []),
            key=lambda c: int(c.get("priority") or 100),
            reverse=True,
        )
        cap_ids = [str(c["id"]) for c in candidates] or catalog_for_abstract(abstract)

        for cap_id in cap_ids:
            if cap_id in seen or cap_id not in available_caps:
                continue
            provider = _provider_for_capability(cap_id)
            if provider and provider != "platform" and not _provider_ready(
                provider, connection_states
            ):
                continue
            args: Dict[str, Any] = {}
            if entities.get("person") and cap_id in (
                "messaging.search_messages",
                "email.search",
                "messaging.search_chats",
            ):
                args["query"] = str(entities["person"])
            elif entities.get("topic") and cap_id == "messaging.search_messages":
                args["query"] = str(entities["topic"])
            item: Dict[str, Any] = {"capability": cap_id, "args": args}
            if provider:
                item["provider"] = provider
            items.append(item)
            seen.add(cap_id)

    return items
