"""Mode B: Gemini Live native audio (Phase 4 — stub until WebSocket session wired)."""

from __future__ import annotations


class GeminiLiveVoiceProvider:

    def __init__(self) -> None:
        self._connected = False

    async def connect(self) -> None:
        self._connected = True
        raise NotImplementedError(
            "Gemini Live provider: wire Firebase AI Logic or server WebSocket proxy"
        )

    async def close(self) -> None:
        self._connected = False
