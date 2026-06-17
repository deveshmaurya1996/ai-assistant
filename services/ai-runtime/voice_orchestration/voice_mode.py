from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class VoiceModeDecision:
    mode: str
    available: list[str]
    note: str
    future_modes: list[str]
    full_duplex_available: bool
    pollinations_voice: bool
    stt_provider: str
    tts_provider: str


def livekit_configured() -> bool:
    return bool(
        os.getenv("LIVEKIT_URL", "").strip()
        and os.getenv("LIVEKIT_API_KEY", "").strip()
        and os.getenv("LIVEKIT_API_SECRET", "").strip()
    )


def resolve_voice_mode(user_id: Optional[str] = None) -> VoiceModeDecision:
    _ = user_id
    ready = livekit_configured()
    mode = "livekit" if ready else "unconfigured"
    return VoiceModeDecision(
        mode=mode,
        available=["livekit"] if ready else [],
        note=(
            "LiveKit voice: Faster-Whisper STT -> agent turn -> Piper TTS"
            if ready
            else "Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET to enable voice"
        ),
        future_modes=[],
        full_duplex_available=False,
        pollinations_voice=False,
        stt_provider="faster-whisper",
        tts_provider="piper",
    )
