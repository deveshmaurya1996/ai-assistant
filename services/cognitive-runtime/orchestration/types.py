from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


def planner_debug_enabled() -> bool:
    return os.getenv("PLANNER_DEBUG", "").strip().lower() in ("1", "true", "yes")


def planner_trace_in_sse() -> bool:
    return os.getenv("PLANNER_TRACE", "").strip().lower() in ("1", "true", "yes")


@dataclass
class StageRecord:
    name: str
    decision: str
    duration_ms: float = 0.0
    detail: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "name": self.name,
            "decision": self.decision,
            "duration_ms": round(self.duration_ms, 2),
        }
        if self.detail:
            out["detail"] = self.detail
        return out


@dataclass
class PlanTrace:
    stages: List[StageRecord] = field(default_factory=list)
    signals: Dict[str, bool] = field(default_factory=dict)
    prompt_version: Optional[str] = None
    examples_picked: Optional[List[str]] = None
    llm_raw: Optional[str] = None

    def add_stage(
        self,
        name: str,
        decision: str,
        *,
        duration_ms: float = 0.0,
        detail: Optional[str] = None,
    ) -> None:
        self.stages.append(
            StageRecord(
                name=name,
                decision=decision,
                duration_ms=duration_ms,
                detail=detail,
            )
        )

    def to_dict(self, *, include_debug: bool = False) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "stages": [s.to_dict() for s in self.stages],
            "signals": dict(self.signals),
        }
        if self.prompt_version:
            out["prompt_version"] = self.prompt_version
        if self.examples_picked:
            out["examples_picked"] = list(self.examples_picked)
        if include_debug and self.llm_raw is not None:
            out["llm_raw"] = self.llm_raw
        return out


def attach_trace(result: Dict[str, Any], trace: PlanTrace) -> Dict[str, Any]:
    result["trace"] = trace.to_dict(include_debug=planner_debug_enabled())
    return result
