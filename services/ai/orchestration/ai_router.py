
from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum


class CapabilityRoute(str, Enum):
    REALTIME_VOICE = "realtime_voice"
    ANDROID_LIVE = "android_live"
    FAST_CHAT = "fast_chat"
    SUMMARY = "summary"
    REASONING = "reasoning"
    CODING = "coding"
    IMAGE = "image"
    FALLBACK = "fallback"


@dataclass
class AIRequest:
    capability: CapabilityRoute
    preferred_model: str | None = None
    tier_override: str | None = None 


class AIRouter:
    """Select provider/model by capability. Pollinations is Tier-3 only."""

    def route(self, request: AIRequest) -> tuple[str, str]:
        """Returns (primary_model_id, fallback_model_id)."""
        cap = request.capability

        if cap in (CapabilityRoute.REALTIME_VOICE, CapabilityRoute.ANDROID_LIVE):
            if cap == CapabilityRoute.ANDROID_LIVE and os.getenv("GEMINI_API_KEY"):
                return ("gemini-live", "")
            if os.getenv("OPENAI_API_KEY"):
                return ("openai-realtime", "")
            raise ValueError("Realtime voice requires OPENAI_API_KEY or GEMINI_API_KEY")

        if cap == CapabilityRoute.REASONING and os.getenv("ANTHROPIC_API_KEY"):
            return ("anthropic/claude-sonnet-4-6", "gemini/gemini-3.1-pro-preview")

        if cap == CapabilityRoute.CODING and os.getenv("OPENAI_API_KEY"):
            return ("gpt-5.5", "pollinations/openai")

        if cap in (CapabilityRoute.FAST_CHAT, CapabilityRoute.SUMMARY):
            if os.getenv("GEMINI_API_KEY"):
                return ("gemini/gemini-2.0-flash", "pollinations/openai")
            if os.getenv("OPENAI_API_KEY"):
                return ("gpt-5.5", "pollinations/openai")

        if request.preferred_model:
            fb = "pollinations/openai" if os.getenv("POLLINATIONS_API_KEY") else ""
            return (request.preferred_model, fb)

        if os.getenv("GEMINI_API_KEY"):
            return ("gemini/gemini-3.1-pro-preview", "pollinations/openai")

        if os.getenv("OPENAI_API_KEY"):
            return ("gpt-5.5", "pollinations/openai")

        if os.getenv("POLLINATIONS_API_KEY"):
            return ("pollinations/openai", "")

        raise ValueError("No AI provider API keys configured")

    def allows_pollinations(self, capability: CapabilityRoute) -> bool:
        return capability in (
            CapabilityRoute.FAST_CHAT,
            CapabilityRoute.SUMMARY,
            CapabilityRoute.FALLBACK,
            CapabilityRoute.CODING,
        )
