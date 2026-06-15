"""Integration intent routing — unsupported / disconnected / offline / ready."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Set

IntegrationAction = Literal[
    "execute",
    "connect_prompt",
    "offline_prompt",
    "unsupported_prompt",
    "info_only",
]

SUPPORTED_PROVIDERS: Dict[str, Dict[str, object]] = {
    "google": {
        "display": "Google Workspace (Gmail, Calendar, Drive)",
        "aliases": (
            "google",
            "gmail",
            "email",
            "inbox",
            "mail",
            "calendar",
            "meeting",
            "schedule",
            "drive",
            "google workspace",
            "google drive",
        ),
    },
    "whatsapp": {
        "display": "WhatsApp",
        "aliases": ("whatsapp", "wa ", " wa", "whats app"),
    },
}

UNSUPPORTED_APPS: Dict[str, str] = {
    "slack": "Slack",
    "telegram": "Telegram",
    "teams": "Microsoft Teams",
    "microsoft teams": "Microsoft Teams",
    "discord": "Discord",
    "notion": "Notion",
    "instagram": "Instagram",
    "facebook": "Facebook",
    "messenger": "Facebook Messenger",
    "twitter": "Twitter",
    " x ": "X (Twitter)",
    "linkedin": "LinkedIn",
    "signal": "Signal",
    "imessage": "iMessage",
    "outlook": "Outlook",
    "yahoo mail": "Yahoo Mail",
    "protonmail": "Proton Mail",
    "spotify": "Spotify",
    "trello": "Trello",
    "asana": "Asana",
    "jira": "Jira",
    "zoom": "Zoom",
}

_CONNECTED_APPS_SIGNALS = (
    "connected apps",
    "what is connected",
    "what's connected",
    "what apps are connected",
    "which apps are connected",
    "apps are connected",
    "what integrations",
    "which integrations",
)

_READ_INTENT_SIGNALS = (
    "unread",
    "check",
    "list",
    "show",
    "read",
    "new",
    "recent",
    "catch up",
    "summarize",
    "summary",
    "inbox",
    "anything new",
    "what did i miss",
)


@dataclass
class IntegrationIntent:
    action: IntegrationAction
    providers: List[str] = field(default_factory=list)
    unsupported_apps: List[str] = field(default_factory=list)
    user_guidance: str = ""


def is_connected_apps_query(query: str) -> bool:
    q = query.lower()
    return any(signal in q for signal in _CONNECTED_APPS_SIGNALS)


def is_read_intent(query: str) -> bool:
    q = query.lower()
    return any(signal in q for signal in _READ_INTENT_SIGNALS)


def is_send_intent(query: str) -> bool:
    q = query.lower()
    if is_read_intent(q) and not re.search(r"\b(send|text)\b", q):
        return False
    return bool(
        re.search(r"\b(send|text)\b", q)
        or re.search(r"\bmessage\s+to\b", q)
        or re.search(r"\bwhatsapp\s+[A-Za-z][\w'-]+\s*[:,-]", query, re.IGNORECASE)
    )


def is_email_send_intent(query: str) -> bool:
    q = query.lower()
    if not re.search(r"\b(send|compose|write|draft)\b", q):
        return False
    if re.search(r"\b(email|e-mail|gmail)\b", q):
        return True
    return bool(re.search(r"[\w.+-]+@[\w.-]+\.\w+", query))


def _detect_unsupported_apps(query: str) -> List[str]:
    q = f" {query.lower()} "
    found: List[str] = []
    for keyword, display in UNSUPPORTED_APPS.items():
        if keyword in q and display not in found:
            found.append(display)
    return found


def _detect_supported_providers(query: str) -> Set[str]:
    q = query.lower()
    found: Set[str] = set()
    for provider_id, meta in SUPPORTED_PROVIDERS.items():
        aliases = meta.get("aliases", ())
        if any(alias in q for alias in aliases):
            found.add(provider_id)
    return found


def _provider_state(
    provider_id: str,
    connection_states: List[Dict[str, Any]],
) -> str:
    for row in connection_states:
        if row.get("providerId") == provider_id:
            return str(row.get("state", "not_connected"))
    return "not_connected"


def _unsupported_guidance(apps: List[str]) -> str:
    names = ", ".join(apps[:3])
    subject = names if names else "that app"
    return (
        f"We don't support {subject} in the assistant yet, but we're actively working on adding it. "
        "Today you can connect Google (Gmail, Calendar, Drive) or WhatsApp in Connect Apps. "
        "The assistant can read, send, reply, star, and draft emails; manage calendar and Drive; "
        "and read or send WhatsApp messages — but cannot delete emails or WhatsApp messages."
    )


def _connect_guidance(provider_id: str) -> str:
    display = str(SUPPORTED_PROVIDERS.get(provider_id, {}).get("display", provider_id))
    return (
        f"{display} isn't connected yet. Open Connect Apps in the app and link {display} "
        "before I can access it."
    )


def _offline_guidance(provider_id: str) -> str:
    display = str(SUPPORTED_PROVIDERS.get(provider_id, {}).get("display", provider_id))
    return (
        f"{display} is linked but offline or was disconnected (for example if WhatsApp "
        "opened on another device). Open Connect Apps and reconnect so I can access it."
    )


def resolve_integration_intent(
    query: str,
    connection_states: Optional[List[Dict[str, Any]]] = None,
) -> IntegrationIntent:
    """Classify integration-related queries before tool planning."""
    connection_states = connection_states or []

    if is_connected_apps_query(query):
        return IntegrationIntent(action="info_only")

    unsupported = _detect_unsupported_apps(query)
    if unsupported:
        return IntegrationIntent(
            action="unsupported_prompt",
            unsupported_apps=unsupported,
            user_guidance=_unsupported_guidance(unsupported),
        )

    mentioned = _detect_supported_providers(query)
    if not mentioned:
        return IntegrationIntent(action="execute")

    not_connected: List[str] = []
    offline: List[str] = []
    ready: List[str] = []

    for provider_id in sorted(mentioned):
        state = _provider_state(provider_id, connection_states)
        if state == "ready":
            ready.append(provider_id)
        elif state == "offline":
            offline.append(provider_id)
        else:
            not_connected.append(provider_id)

    if not_connected:
        guidance = _connect_guidance(not_connected[0])
        return IntegrationIntent(
            action="connect_prompt",
            providers=not_connected,
            user_guidance=guidance,
        )

    if offline and not ready:
        guidance = _offline_guidance(offline[0])
        return IntegrationIntent(
            action="offline_prompt",
            providers=offline,
            user_guidance=guidance,
        )

    if offline and ready:
        names = ", ".join(
            str(SUPPORTED_PROVIDERS.get(p, {}).get("display", p)) for p in offline
        )
        return IntegrationIntent(
            action="execute",
            providers=ready,
            user_guidance=f"Note: {names} is offline — only using connected apps for this request.",
        )

    return IntegrationIntent(action="execute", providers=list(ready or mentioned))
