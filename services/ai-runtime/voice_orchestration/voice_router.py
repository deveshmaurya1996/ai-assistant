
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class VoiceMode(str, Enum):
    CLASSIC = "classic"
    FULL_DUPLEX = "full_duplex"


@dataclass
class VoiceSessionRequest:
    user_id: str
    platform: str = "android"
    prefer_live: bool = True
    network_quality: str = "good"


class VoiceRouter:
    """Classic voice: NVIDIA multimodal STT → integrate LLM → Magpie or Pollinations TTS.

    nemotron-voicechat (FULL_DUPLEX) requires early access and a streaming/WebRTC stack —
    see https://github.com/NVIDIA-AI-Blueprints/nemotron-voice-agent. Not wired to mobile yet.
    """

    def route(self, request: VoiceSessionRequest) -> VoiceMode:
        if request.prefer_live and self.full_duplex_available():
            return VoiceMode.FULL_DUPLEX
        return VoiceMode.CLASSIC

    def full_duplex_available(self) -> bool:
        return False

    def pollinations_allowed(self) -> bool:
        return True
