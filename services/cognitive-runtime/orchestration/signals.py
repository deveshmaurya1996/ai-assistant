"""Unified query signal detection for turn routing and planner stages."""

from __future__ import annotations

import re

from orchestration.integration_intent import is_connected_apps_query

_INTEGRATION_SIGNALS = [
    "whatsapp",
    "wa ",
    "gmail",
    "email",
    "inbox",
    "mail",
    "calendar",
    "meeting",
    "schedule",
    "drive",
    "google",
    "integration",
    "connected apps",
    "what is connected",
    "what's connected",
    "what apps are connected",
    "which apps are connected",
    "apps are connected",
]

_FILE_SIGNALS = [
    "uploaded",
    "my pdf",
    "my document",
    "attached file",
    "attached pdf",
    "the contract",
    "page ",
    "my file",
    "my spreadsheet",
    "my image",
    "file search",
    "search my files",
]

_ACTION_SIGNALS = [
    "send",
    "text ",
    "message to",
    "check my",
    "check the",
    "check everything",
    "list my",
    "list unread",
    "show my",
    "read my",
    "search my",
    "summarize",
    "summary",
    "catch up",
    "catch me up",
    "anything new",
    "what did i miss",
    "remember this",
    "save this",
    "write down",
    "jot down",
    "find note",
    "my notes",
]


def is_likely_tool_query(query: str) -> bool:
    q = query.lower()
    return any(
        signal in q
        for signal in _INTEGRATION_SIGNALS + _ACTION_SIGNALS + _FILE_SIGNALS
    )


def is_conversational_query(query: str) -> bool:
    return not is_likely_tool_query(query)


def collect_plan_signals(query: str, route_text: str) -> dict[str, bool]:
    from orchestration.scheduling_planner import looks_like_scheduling_query

    return {
        "tool_query": is_likely_tool_query(query),
        "connected_apps": is_connected_apps_query(query),
        "scheduling": looks_like_scheduling_query(route_text, []),
    }
