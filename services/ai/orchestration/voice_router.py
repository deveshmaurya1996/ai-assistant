
from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum


class VoiceMode(str, Enum):
    CLASSIC = "classic"
    OPENAI_REALTIME = "openai-realtime"
    GEMINI_LIVE = "gemini-live"


@dataclass
class VoiceSessionRequest:
    user_id: str
    platform: str = "android"
    prefer_live: bool = True
    network_quality: str = "good"


class VoiceRouter:
    def route(self, request: VoiceSessionRequest) -> VoiceMode:
        flag = os.getenv("VOICE_MODE", "auto").strip().lower()

        if flag == "classic":
            return VoiceMode.CLASSIC
        if flag == "openai-realtime" and os.getenv("OPENAI_API_KEY"):
            return VoiceMode.OPENAI_REALTIME
        if flag == "gemini-live" and os.getenv("GEMINI_API_KEY"):
            return VoiceMode.GEMINI_LIVE

        if request.network_quality == "poor":
            return VoiceMode.CLASSIC

        if request.prefer_live:
            if request.platform == "android" and os.getenv("GEMINI_API_KEY"):
                return VoiceMode.GEMINI_LIVE
            if os.getenv("OPENAI_API_KEY"):
                return VoiceMode.OPENAI_REALTIME

        return VoiceMode.CLASSIC

    def pollinations_allowed(self) -> bool:
        return False
