from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from orchestration.capability_llm import llm_plan_capabilities
from context.context_builder import fetch_integration_manifest
from orchestration.heuristics import run_heuristics
from orchestration.heuristics.connected_apps import heuristic_connected_apps_query
from orchestration.heuristics.helpers import connected_providers
from orchestration.integration_intent import resolve_integration_intent
from orchestration.plan_helpers import available_tools, build_plan_result
from workflows.automation import (
    looks_like_scheduling_query,
    plan_scheduling_actions,
    should_run_scheduling_planner,
)
from orchestration.capability_engine import resolve_tools
from orchestration.intent_classifier import infer_turn_intent
from orchestration.signals import collect_plan_signals, is_likely_tool_query
from orchestration.types import PlanTrace

logger = logging.getLogger(__name__)


@dataclass
class PlanInput:
    query: str
    context: str
    user_id: str
    manifest_caps: Optional[Set[str]] = None
    manifest_connections: Optional[List[Dict[str, Any]]] = None
    manifest_connection_states: Optional[List[Dict[str, Any]]] = None
    routing_query: Optional[str] = None
    timezone: Optional[str] = None
    chat_history: Optional[List[Dict[str, str]]] = None
    skip_heuristics: bool = False
    force_planner: Optional[str] = None
    trace: PlanTrace = field(default_factory=PlanTrace)


async def run_planner_pipeline(inp: PlanInput) -> Dict[str, Any]:
    trace = inp.trace
    query = inp.query
    context = inp.context
    user_id = inp.user_id
    history = inp.chat_history or []
    route_text = (inp.routing_query or query).strip() or query
    warnings: List[str] = []

    trace.signals = collect_plan_signals(query, route_text)
    intent_plan = infer_turn_intent(query, history)

    connection_states = list(inp.manifest_connection_states or [])
    if not connection_states:
        _, _, fetched_connections, fetched_states = await fetch_integration_manifest(
            user_id
        )
        if fetched_states:
            connection_states = fetched_states
        elif fetched_connections:
            connection_states = [
                {"providerId": c.get("providerId"), "state": "ready"}
                for c in fetched_connections
                if c.get("providerId")
            ]

    t0 = time.perf_counter()
    tools, connections, _, available_caps, avail_warnings = await available_tools(
        user_id,
        manifest_caps=inp.manifest_caps,
        manifest_connections=inp.manifest_connections,
    )
    warnings.extend(avail_warnings)
    connected = connected_providers(connections)
    trace.add_stage(
        "manifest",
        "ready",
        duration_ms=(time.perf_counter() - t0) * 1000,
        detail=f"caps={len(available_caps)} tools={len(tools)}",
    )

    if heuristic_connected_apps_query(query):
        trace.add_stage("integration_gate", "connected_apps_info")
        logger.info("[planner] label=connected-apps-info user=%s", user_id)
        return build_plan_result(
            query, context, user_id, connections, tools, [],
            "connected-apps-info", warnings, trace=trace,
        )

    t_gate = time.perf_counter()
    integration_intent = resolve_integration_intent(query, connection_states)
    if integration_intent.user_guidance and integration_intent.action == "execute":
        warnings.append(integration_intent.user_guidance)

    if integration_intent.action == "unsupported_prompt":
        trace.add_stage(
            "integration_gate", "unsupported",
            duration_ms=(time.perf_counter() - t_gate) * 1000,
        )
        logger.info("[planner] label=integration-unsupported user=%s", user_id)
        return build_plan_result(
            query, context, user_id, connections, tools, [],
            "integration-unsupported", warnings,
            user_guidance=integration_intent.user_guidance, trace=trace,
        )

    if integration_intent.action in ("connect_prompt", "offline_prompt"):
        trace.add_stage(
            "integration_gate", integration_intent.action,
            duration_ms=(time.perf_counter() - t_gate) * 1000,
        )
        logger.info("[planner] label=integration-blocked user=%s", user_id)
        return build_plan_result(
            query, context, user_id, connections, tools, [],
            "integration-blocked", warnings,
            user_guidance=integration_intent.user_guidance, trace=trace,
        )
    trace.add_stage("integration_gate", "pass", duration_ms=(time.perf_counter() - t_gate) * 1000)

    if not inp.skip_heuristics:
        t_heur = time.perf_counter()
        heuristic_items = run_heuristics(
            query, available_caps, connected, timezone=inp.timezone
        )
        if heuristic_items:
            trace.add_stage(
                "heuristic",
                "matched",
                duration_ms=(time.perf_counter() - t_heur) * 1000,
                detail=f"items={len(heuristic_items)}",
            )
            logger.info(
                "[planner] label=heuristic user=%s items=%d",
                user_id, len(heuristic_items),
            )
            return build_plan_result(
                query, context, user_id, connections, tools,
                heuristic_items, "heuristic", warnings, trace=trace,
            )
        trace.add_stage("heuristic", "no_match", duration_ms=(time.perf_counter() - t_heur) * 1000)

    if should_run_scheduling_planner(route_text, history):
        t_sched = time.perf_counter()
        schedule_items, clarification, scheduling_intent, schedule_warnings = (
            await plan_scheduling_actions(
                route_text,
                user_id=user_id,
                chat_history=history,
                timezone=inp.timezone,
            )
        )
        warnings.extend(schedule_warnings)

        if clarification:
            warnings.append(clarification)
            trace.add_stage(
                "scheduling", "clarification",
                duration_ms=(time.perf_counter() - t_sched) * 1000,
            )
            logger.info("[planner] label=llm-scheduling-clarification user=%s", user_id)
            return build_plan_result(
                query, context, user_id, connections, tools, [],
                "llm-scheduling-clarification", warnings, trace=trace,
            )

        if schedule_items:
            trace.add_stage(
                "scheduling", "matched",
                duration_ms=(time.perf_counter() - t_sched) * 1000,
                detail=f"items={len(schedule_items)}",
            )
            logger.info(
                "[planner] label=llm-scheduling user=%s items=%d",
                user_id, len(schedule_items),
            )
            return build_plan_result(
                query, context, user_id, connections, tools,
                schedule_items, "llm-scheduling", warnings, trace=trace,
            )

        if scheduling_intent:
            warnings.append(
                "Scheduling planner did not produce a schedule — "
                "the assistant should ask the user to rephrase or try again."
            )
            trace.add_stage("scheduling", "empty", duration_ms=(time.perf_counter() - t_sched) * 1000)
            logger.info("[planner] label=llm-scheduling-empty user=%s", user_id)
            return build_plan_result(
                query, context, user_id, connections, tools, [],
                "llm-scheduling-empty", warnings, trace=trace,
            )
        trace.add_stage("scheduling", "no_match", duration_ms=(time.perf_counter() - t_sched) * 1000)

    force_llm = inp.force_planner == "capability-llm"

    if (
        not force_llm
        and not intent_plan.needs_live_data
        and not is_likely_tool_query(query)
        and not looks_like_scheduling_query(route_text, history)
    ):
        trace.add_stage("conversational_skip", "skip")
        logger.info("[planner] label=conversational-skip user=%s", user_id)
        return build_plan_result(
            query, context, user_id, connections, tools, [],
            "conversational-skip", warnings, trace=trace,
        )

    if (
        not force_llm
        and looks_like_scheduling_query(route_text, history)
        and not is_likely_tool_query(query)
    ):
        warnings.append(
            "Scheduling follow-up did not produce a schedule — ask the user to rephrase."
        )
        trace.add_stage("scheduling_followup", "empty")
        logger.info("[planner] label=llm-scheduling-empty user=%s", user_id)
        return build_plan_result(
            query, context, user_id, connections, tools, [],
            "llm-scheduling-empty", warnings, trace=trace,
        )

    t_llm = time.perf_counter()
    cap_items, model_used, llm_warnings = await llm_plan_capabilities(
        query, context, user_id, available_caps, connected, trace,
        connection_states=connection_states,
    )
    warnings.extend(llm_warnings)

    if not cap_items:
        cap_items = run_heuristics(query, available_caps, connected, timezone=inp.timezone)

    if not cap_items and intent_plan.needs_live_data and intent_plan.abstract_capabilities:
        cap_items = resolve_tools(
            intent_plan.abstract_capabilities,
            available_caps,
            connection_states=connection_states,
            entities=intent_plan.entities,
        )

    trace.add_stage(
        "capability_llm",
        "done",
        duration_ms=(time.perf_counter() - t_llm) * 1000,
        detail=f"items={len(cap_items)} model={model_used}",
    )
    logger.info(
        "[planner] label=capability-llm user=%s items=%d model=%s",
        user_id, len(cap_items), model_used,
    )
    return build_plan_result(
        query, context, user_id, connections, tools,
        cap_items, "capability-llm", warnings, model_used, trace=trace,
    )
