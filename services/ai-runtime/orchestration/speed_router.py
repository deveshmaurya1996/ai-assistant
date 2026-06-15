from __future__ import annotations

from enum import Enum

from orchestration.turn_router import TurnIntent, TurnRoute


class SpeedProfile(str, Enum):
    FAST_RESPONSE = "fast_response"
    BALANCED = "balanced"
    DEEP_REASONING = "deep_reasoning"
    VOICE_REALTIME = "voice_realtime"


def resolve_speed_profile(*, route: TurnRoute, source: str) -> SpeedProfile:
    if source == "voice":
        return SpeedProfile.VOICE_REALTIME
    if route.stream_task in ("reasoning", "coding"):
        return SpeedProfile.DEEP_REASONING
    if route.intent in (TurnIntent.TOOL, TurnIntent.CONFIRM, TurnIntent.MEMORY):
        return SpeedProfile.BALANCED
    return SpeedProfile.FAST_RESPONSE
