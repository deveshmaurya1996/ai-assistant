
from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum

from models.registry import get_nvidia_model_id, resolve_chain


class CapabilityRoute(str, Enum):
    REALTIME_VOICE = "realtime_voice"
    ANDROID_LIVE = "android_live"
    FAST_CHAT = "fast_chat"
    SUMMARY = "summary"
    REASONING = "reasoning"
    CODING = "coding"
    VISION = "vision"
    IMAGE = "image"
    FALLBACK = "fallback"


@dataclass
class AIRequest:
    capability: CapabilityRoute
    preferred_model: str | None = None
    tier_override: str | None = None


class AIRouter:
    """Select provider/model by capability. NVIDIA primary, Pollinations fallback/media."""

    def _text_fallback(self) -> str:
        chain = resolve_chain("fallback")
        return chain[0] if chain else ""

    def route(self, request: AIRequest) -> tuple[str, str]:
        """Returns (primary_model_id, fallback_model_id)."""
        cap = request.capability
        fb = self._text_fallback()

        if cap in (CapabilityRoute.REALTIME_VOICE, CapabilityRoute.ANDROID_LIVE):
            raise ValueError(
                "Live voice is disabled. Use classic voice (Pollinations STT + NVIDIA chat + Pollinations TTS)."
            )

        if cap == CapabilityRoute.REASONING:
            chain = resolve_chain("reasoning")
            if chain:
                return (chain[0], chain[1] if len(chain) > 1 else fb)

        if cap == CapabilityRoute.CODING:
            chain = resolve_chain("coding")
            if chain:
                return (chain[0], chain[1] if len(chain) > 1 else fb)

        if cap in (CapabilityRoute.VISION,):
            chain = resolve_chain("vision")
            if chain:
                return (chain[0], chain[1] if len(chain) > 1 else fb)

        if cap in (CapabilityRoute.FAST_CHAT, CapabilityRoute.SUMMARY):
            chain = resolve_chain("fast_chat" if cap == CapabilityRoute.FAST_CHAT else "summary")
            if chain:
                return (chain[0], chain[1] if len(chain) > 1 else fb)

        if request.preferred_model:
            return (request.preferred_model, fb)

        if os.getenv("NVIDIA_API_KEY"):
            return (get_nvidia_model_id(), fb)

        if os.getenv("POLLINATIONS_API_KEY"):
            return ("pollinations/openai", "")

        raise ValueError("No AI provider API keys configured (NVIDIA_API_KEY or POLLINATIONS_API_KEY)")

    def allows_pollinations(self, capability: CapabilityRoute) -> bool:
        return capability in (
            CapabilityRoute.FAST_CHAT,
            CapabilityRoute.SUMMARY,
            CapabilityRoute.FALLBACK,
            CapabilityRoute.CODING,
            CapabilityRoute.IMAGE,
        )
