from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

from cognitive_env_loader import resolve_tool_runtime_url
from orchestration.capability_map import CAPABILITY_TO_TOOL, normalize_planned_item
from orchestration.context import fetch_integration_manifest

TOOL_RUNTIME_URL = resolve_tool_runtime_url()


def healthy_provider_ids(connections: List[Dict[str, Any]]) -> Set[str]:
    return {str(c.get("providerId", "")) for c in connections if c.get("providerId")}


def filter_caps_for_providers(
    cap_ids: Set[str], healthy_providers: Set[str]
) -> Set[str]:
    if not healthy_providers:
        return set()
    out: Set[str] = set()
    for cap_id in cap_ids:
        if cap_id not in CAPABILITY_TO_TOOL:
            continue
        expected_prov, _ = CAPABILITY_TO_TOOL[cap_id]
        if expected_prov in healthy_providers or expected_prov == "platform":
            out.add(cap_id)
        elif cap_id in ("drive.search", "drive.get_content"):
            if "google" in healthy_providers:
                out.add(cap_id)
        elif cap_id == "resources.search":
            out.add(cap_id)
        elif cap_id == "image.edit":
            if "platform" in healthy_providers or not healthy_providers:
                out.add(cap_id)
    return out


async def available_tools(
    user_id: str,
    manifest_caps: Optional[Set[str]] = None,
    manifest_connections: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[Set[str], List[Dict[str, Any]], List[Dict[str, Any]], Set[str], List[str]]:
    tools: Set[str] = set()
    connections: List[Dict[str, Any]] = list(manifest_connections or [])
    tool_schemas: List[Dict[str, Any]] = []
    available_caps: Set[str] = set(manifest_caps or set())
    warnings: List[str] = []
    using_manifest = manifest_caps is not None and manifest_connections is not None

    if not using_manifest:
        _, fetched_caps, fetched_connections, _ = await fetch_integration_manifest(user_id)
        available_caps |= fetched_caps
        connections = list(fetched_connections)

    healthy_providers = healthy_provider_ids(connections)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            res = await client.get(
                f"{TOOL_RUNTIME_URL}/v1/tools/available",
                params={"userId": user_id},
            )
            if res.status_code == 200:
                data = res.json()
                tool_schemas = data.get("tools", [])
                all_tools = {t["function"]["name"] for t in tool_schemas if t.get("function")}
                if healthy_providers:
                    tools = {
                        name
                        for name in all_tools
                        if name.split(".")[0] in healthy_providers
                        or name.split(".")[0]
                        in ("resources", "contacts", "reminder", "automation")
                    }
                else:
                    tools = set()
            else:
                warnings.append(f"tool-runtime tools/available: HTTP {res.status_code}")
        except Exception as exc:
            warnings.append(f"tool-runtime unreachable: {exc}")

    if not available_caps and healthy_providers:
        for cap_id, (_, tool) in CAPABILITY_TO_TOOL.items():
            if tool in tools:
                available_caps.add(cap_id)

    available_caps = filter_caps_for_providers(available_caps, healthy_providers)
    return tools, connections, tool_schemas, available_caps, warnings


def capabilities_to_tools(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for raw in items:
        item = normalize_planned_item(dict(raw))
        if item.get("tool"):
            out.append(item)
    return out


def build_plan_result(
    query: str,
    context: str,
    user_id: str,
    connections: List[Dict[str, Any]],
    tools: Set[str],
    cap_items: List[Dict[str, Any]],
    planner: str,
    warnings: List[str],
    model_used: str | None = None,
    user_guidance: str | None = None,
    trace: Any = None,
) -> Dict[str, Any]:
    from orchestration.types import attach_trace

    result: Dict[str, Any] = {
        "query": query,
        "context": context,
        "user_id": user_id,
        "capabilities": cap_items,
        "tools": capabilities_to_tools(cap_items),
        "connections": connections,
        "available_tool_count": len(tools),
        "planner": planner,
        "model_used": model_used,
        "warnings": warnings,
    }
    if user_guidance:
        result["user_guidance"] = user_guidance
    if trace is not None:
        attach_trace(result, trace)
    return result
