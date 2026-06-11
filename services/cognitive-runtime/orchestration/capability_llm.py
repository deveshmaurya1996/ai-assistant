from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Set, Tuple

from orchestration.capability_map import default_provider_for_capability
from orchestration.llm.client import complete_planner, planner_model
from orchestration.llm.json_parse import parse_llm_json
from orchestration.prompt_loader import (
    load_capability_system_prompt,
    pick_examples,
    render_examples_block,
)
from orchestration.types import PlanTrace, planner_debug_enabled

logger = logging.getLogger(__name__)

PLANNER_CONTEXT_MAX_CHARS = int(os.getenv("PLANNER_CONTEXT_MAX_CHARS", "12000"))


def _truncate_context(context: str) -> str:
    if len(context) <= PLANNER_CONTEXT_MAX_CHARS:
        return context
    return (
        context[:PLANNER_CONTEXT_MAX_CHARS]
        + "\n\n[CONTEXT_TRUNCATED — manifest was shortened for planner prompt]"
    )


def _capability_allowed(cap_id: str, available_caps: Set[str]) -> bool:
    return cap_id in available_caps


async def llm_plan_capabilities(
    query: str,
    context: str,
    user_id: str,
    available_caps: Set[str],
    connected: Set[str],
    trace: PlanTrace,
) -> Tuple[List[Dict[str, Any]], str | None, List[str]]:
    del connected
    warnings: List[str] = []
    if not planner_model():
        warnings.append("No planner model configured")
        trace.add_stage("capability_llm", "skip", detail="no_model")
        return [], None, warnings

    system = load_capability_system_prompt()
    examples = pick_examples(query, "capability")
    examples_block = render_examples_block(examples)
    trace.prompt_version = os.getenv("CAPABILITY_PROMPT_VERSION", "v1")
    trace.examples_picked = [str(e.get("id", "")) for e in examples if e.get("id")]

    user_prompt = (
        f"User query: {query}\n\n"
        f"Context:\n{_truncate_context(context)}\n\n"
        "Plan using only capability IDs from the Context above (includes connector playbooks when connected).\n\n"
    )
    if examples_block:
        user_prompt += f"{examples_block}\n\n"
    user_prompt += "JSON:"

    cap_items: List[Dict[str, Any]] = []
    model_used = None
    raw = ""

    try:
        raw, model_used, _data = await complete_planner(
            system=system,
            user_prompt=user_prompt,
            user_id=user_id,
        )
        if planner_debug_enabled():
            trace.llm_raw = raw

        planned = parse_llm_json(raw)
        if not planned.get("capabilities") and not planned.get("tools"):
            logger.warning(
                "[capability_llm] parse empty or failed preview=%s",
                raw[:300],
            )
            trace.add_stage("capability_llm", "parse_empty", detail=raw[:120])
        else:
            trace.add_stage(
                "capability_llm",
                "parsed",
                detail=f"caps={len(planned.get('capabilities', []))}",
            )

        for item in planned.get("capabilities", []) if isinstance(planned, dict) else []:
            cap_id = item.get("capability")
            if not cap_id:
                continue
            if not _capability_allowed(cap_id, available_caps):
                continue
            args = item.get("args", {}) if isinstance(item.get("args", {}), dict) else {}
            provider = item.get("provider") or default_provider_for_capability(cap_id)
            cap_items.append(
                {
                    "capability": cap_id,
                    "provider": provider,
                    "args": args,
                }
            )

        if not cap_items and isinstance(planned, dict):
            for item in planned.get("tools", []):
                name = item.get("tool")
                if name:
                    args = (
                        item.get("args", {})
                        if isinstance(item.get("args", {}), dict)
                        else {}
                    )
                    cap_items.append({"tool": name, "args": args})
    except Exception as exc:
        warnings.append(f"LLM planner failed: {exc}")
        logger.warning("[capability_llm] failed: %s preview=%s", exc, raw[:300])
        trace.add_stage("capability_llm", "error", detail=str(exc)[:200])

    return cap_items, model_used, warnings
