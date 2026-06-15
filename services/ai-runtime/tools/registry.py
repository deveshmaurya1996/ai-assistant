
import json
from pathlib import Path
from typing import Dict, Optional, Tuple

_MANIFEST_PATH = Path(__file__).resolve().parents[1] / "capability_manifest.json"


def _load_manifest() -> dict:
    if not _MANIFEST_PATH.exists():
        return {"capabilities": []}
    with open(_MANIFEST_PATH, encoding="utf-8") as f:
        return json.load(f)


def _build_maps() -> Tuple[Dict[str, Tuple[str, str]], Dict[str, str]]:
    data = _load_manifest()
    cap_to_tool: Dict[str, Tuple[str, str]] = {}
    tool_to_cap: Dict[str, str] = {}
    for entry in data.get("capabilities", []):
        cap_id = entry.get("id")
        if not cap_id:
            continue
        providers = entry.get("providers") or []
        if not providers:
            continue
        p0 = providers[0]
        provider_id = p0.get("providerId", "")
        execution_tool = p0.get("executionTool", "")
        cap_to_tool[cap_id] = (provider_id, execution_tool)
        tool_to_cap[execution_tool] = cap_id
    return cap_to_tool, tool_to_cap


_CAP_TO_TOOL, _TOOL_TO_CAP = _build_maps()

# Public aliases used by planner/executor
CAPABILITY_TO_TOOL: Dict[str, Tuple[str, str]] = _CAP_TO_TOOL
TOOL_TO_CAPABILITY: Dict[str, str] = _TOOL_TO_CAP


def reload_capability_manifest() -> None:
    """Reload maps after manifest regeneration."""
    global CAPABILITY_TO_TOOL, TOOL_TO_CAPABILITY
    cap, tool = _build_maps()
    CAPABILITY_TO_TOOL.clear()
    CAPABILITY_TO_TOOL.update(cap)
    TOOL_TO_CAPABILITY.clear()
    TOOL_TO_CAPABILITY.update(tool)


def capability_to_tool(capability_id: str, provider: Optional[str] = None) -> Optional[str]:
    entry = CAPABILITY_TO_TOOL.get(capability_id)
    if not entry:
        return None
    expected_provider, tool = entry
    if provider and provider != expected_provider:
        # Try find matching provider binding
        data = _load_manifest()
        for cap in data.get("capabilities", []):
            if cap.get("id") != capability_id:
                continue
            for p in cap.get("providers") or []:
                if p.get("providerId") == provider:
                    return p.get("executionTool")
        return None
    return tool


def default_provider_for_capability(capability_id: str) -> Optional[str]:
    entry = CAPABILITY_TO_TOOL.get(capability_id)
    return entry[0] if entry else None


def normalize_planned_item(item: Dict) -> Dict:
    """Ensure planned item has tool field (from capability if needed)."""
    if item.get("tool"):
        cap = TOOL_TO_CAPABILITY.get(item["tool"])
        if cap and not item.get("capability"):
            item = {**item, "capability": cap}
        if item.get("capability") and not item.get("provider"):
            prov = default_provider_for_capability(item["capability"])
            if prov:
                item = {**item, "provider": prov}
        return item

    cap_id = item.get("capability")
    if not cap_id:
        return item

    provider = item.get("provider") or default_provider_for_capability(cap_id)
    if provider and not item.get("provider"):
        item = {**item, "provider": provider}

    tool = capability_to_tool(cap_id, provider)
    if tool:
        return {**item, "tool": tool}
    return item


def planner_capability_ids() -> list[str]:
    data = _load_manifest()
    return [
        c["id"]
        for c in data.get("capabilities", [])
        if c.get("plannerVisible") and c.get("id")
    ]
