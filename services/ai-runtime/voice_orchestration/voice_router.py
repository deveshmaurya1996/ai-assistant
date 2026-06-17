from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from voice_orchestration.voice_mode import resolve_voice_mode

__all__ = ["VoiceRouter", "VoiceMode", "VoiceSessionRequest", "resolve_voice_mode"]


class VoiceMode(str, Enum):
    LIVEKIT = "livekit"
    UNCONFIGURED = "unconfigured"
    CLASSIC = "classic"
    FULL_DUPLEX = "full_duplex"


@dataclass
class VoiceSessionRequest:
    user_id: str
    platform: str = "android"
    prefer_live: bool = True
    network_quality: str = "good"


class VoiceRouter:

    def route(self, request: VoiceSessionRequest) -> VoiceMode:
        decision = resolve_voice_mode(request.user_id)
        if decision.mode == "livekit":
            return VoiceMode.LIVEKIT
        if decision.mode == "unconfigured":
            return VoiceMode.UNCONFIGURED
        return VoiceMode.CLASSIC

    def full_duplex_available(self) -> bool:
        return resolve_voice_mode().full_duplex_available

    def pollinations_allowed(self) -> bool:
        return resolve_voice_mode().pollinations_voice
