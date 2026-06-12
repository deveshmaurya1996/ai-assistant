from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from orchestration.speed_router import SpeedProfile
from orchestration.turn_router import TurnIntent, TurnRoute

_SPEED_PROFILE_DEFAULTS: dict[SpeedProfile, dict] = {
    SpeedProfile.FAST_RESPONSE: {
        "task": "fast_chat",
        "deadline_ms": 30_000,
        "allow_thinking": False,
        "skip_planner": False,
        "memory_budget_ms": None,
        "max_tokens": None,
    },
    SpeedProfile.BALANCED: {
        "task": None,
        "deadline_ms": 60_000,
        "allow_thinking": False,
        "skip_planner": False,
        "memory_budget_ms": None,
        "max_tokens": None,
    },
    SpeedProfile.DEEP_REASONING: {
        "task": "reasoning",
        "deadline_ms": 120_000,
        "allow_thinking": True,
        "skip_planner": False,
        "memory_budget_ms": None,
        "max_tokens": None,
    },
    SpeedProfile.VOICE_REALTIME: {
        "task": "fast_chat",
        "deadline_ms": 15_000,
        "allow_thinking": False,
        "skip_planner": True,
        "memory_budget_ms": 100,
        "max_tokens": 200,
    },
}

_THINKING_TASKS = frozenset({"reasoning", "planner"})


@dataclass(frozen=True)
class ResolvedTurn:
    task: str
    allow_thinking: bool
    allow_rag: bool
    deadline_ms: int
    speed_profile: str
    task_locked: bool = True
    skip_planner: bool = False
    memory_budget_ms: Optional[int] = None
    max_tokens: Optional[int] = None


def build_resolved_turn(
    route: TurnRoute,
    *,
    retrieve_memory: bool,
    speed_profile: SpeedProfile,
) -> ResolvedTurn:
    defaults = _SPEED_PROFILE_DEFAULTS[speed_profile]
    route_task = route.stream_task if route.stream_task != "auto" else "fast_chat"
    profile_task = defaults.get("task")
    task = profile_task if profile_task else route_task

    allow_thinking = bool(defaults.get("allow_thinking"))
    if speed_profile == SpeedProfile.BALANCED and task in _THINKING_TASKS:
        allow_thinking = True

    task_locked = speed_profile != SpeedProfile.BALANCED or route.stream_task != "auto"
    if speed_profile in (SpeedProfile.FAST_RESPONSE, SpeedProfile.VOICE_REALTIME):
        task_locked = True
    if speed_profile == SpeedProfile.DEEP_REASONING:
        task_locked = True

    return ResolvedTurn(
        task=task,
        allow_thinking=allow_thinking,
        allow_rag=retrieve_memory,
        deadline_ms=int(defaults["deadline_ms"]),
        speed_profile=speed_profile.value,
        task_locked=task_locked,
        skip_planner=bool(defaults.get("skip_planner")),
        memory_budget_ms=defaults.get("memory_budget_ms"),
        max_tokens=defaults.get("max_tokens"),
    )
