from __future__ import annotations

from dataclasses import dataclass

from orchestration.turn_router import TurnIntent, TurnRoute

_INTENT_DEADLINE_MS: dict[TurnIntent, int] = {
    TurnIntent.CASUAL: 30_000,
    TurnIntent.MEMORY: 45_000,
    TurnIntent.KNOWLEDGE: 60_000,
    TurnIntent.TOOL: 90_000,
    TurnIntent.CONFIRM: 90_000,
}

_THINKING_TASKS = frozenset({"reasoning", "planner"})


@dataclass(frozen=True)
class ResolvedTurn:
    task: str
    allow_thinking: bool
    allow_rag: bool
    deadline_ms: int
    task_locked: bool = True


def build_resolved_turn(route: TurnRoute, *, retrieve_memory: bool) -> ResolvedTurn:
    task = route.stream_task if route.stream_task != "auto" else "fast_chat"
    return ResolvedTurn(
        task=task,
        allow_thinking=task in _THINKING_TASKS,
        allow_rag=retrieve_memory,
        deadline_ms=_INTENT_DEADLINE_MS.get(route.intent, 60_000),
        task_locked=route.stream_task != "auto",
    )
