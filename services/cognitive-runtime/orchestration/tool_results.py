
from __future__ import annotations

from typing import Any, Dict, List

_TOOL_REPLY_INSTRUCTION = (
    "Reply in one short, friendly sentence. "
    "For reminders: ONLY say it was scheduled if the tool result line starts with "
    "'Reminder scheduled:' — never claim success when the result says 'Could not schedule'. "
    "If scheduling succeeded, confirm the reminder title and time. "
    "If inbox data was fetched, summarize only important/urgent/actionable items; "
    "say clearly if nothing needs attention. "
    "If a connection error occurred, tell the user to open Connect Apps and link or reconnect the app — "
    "do not say the system is broken. "
    "If it failed for other reasons, state that briefly and suggest a concrete next step. "
    "Never mention tool names, execution IDs, JSON, Python dicts, or raw metadata."
)

_INTEGRATION_GUIDANCE_INSTRUCTION = (
    "Use the integration guidance below as the authoritative answer. "
    "Do not claim you accessed the app or ran any tools. "
    "Be friendly and direct."
)

_INBOX_TOOLS = frozenset(
    {
        "email.list_unread",
        "email.read_email",
        "whatsapp.list_unread",
        "messaging.list_unread",
        "whatsapp.read_chat",
        "messaging.read_chat",
    }
)


def format_integration_guidance(guidance: str) -> str:
    text = (guidance or "").strip()
    if not text:
        text = "That integration is not available right now."
    return (
        f"\n\n[System: integration guidance]\n"
        f"- {text}\n\n"
        f"{_INTEGRATION_GUIDANCE_INSTRUCTION}"
    )


def _classify_integration_error(error: str) -> str:
    lower = error.lower()
    if any(
        phrase in lower
        for phrase in (
            "not connected",
            "session not active",
            "link whatsapp",
            "connect apps",
            "no active",
            "sign-in expired",
            "reconnect",
            "could not be restored",
        )
    ):
        return f"Connection issue: {error}"
    if any(
        phrase in lower
        for phrase in ("could not find", "not found", "no match", "unknown contact")
    ):
        return f"Lookup issue: {error}"
    if any(phrase in lower for phrase in ("timed out", "timeout", "temporary")):
        return f"Temporary issue: {error}"
    return f"Could not complete the request: {error}"


def format_scheduling_clarification(warnings: List[str]) -> str:
    question = next(
        (
            w
            for w in reversed(warnings)
            if w and "unavailable" not in w.lower() and "rephrase" not in w.lower()
        ),
        "What time should I schedule that for?",
    )
    return (
        "\n\n[System: scheduling needs clarification]\n"
        f"- Ask the user this question only (do not claim the reminder was scheduled): {question}\n\n"
        f"{_TOOL_REPLY_INSTRUCTION}"
    )


def format_scheduling_plan_failure(warnings: List[str]) -> str:
    detail = (
        warnings[0]
        if warnings
        else "Could not schedule — please try again in one sentence."
    )
    return (
        "\n\n[System: tool actions completed]\n"
        f"- Could not schedule: {detail}\n\n"
        f"{_TOOL_REPLY_INSTRUCTION}"
    )


def format_tool_results_for_context(tool_results: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for entry in tool_results:
        if entry.get("requiresConfirmation"):
            continue
        line = _summarize_tool_entry(entry)
        if line:
            lines.append(line)

    if not lines:
        return ""

    body = "\n".join(f"- {line}" for line in lines)
    return (
        f"\n\n[System: tool actions completed]\n{body}\n\n{_TOOL_REPLY_INSTRUCTION}"
    )


def _summarize_tool_entry(entry: Dict[str, Any]) -> str:
    tool = str(entry.get("tool") or "")
    status = str(entry.get("status") or "").lower()

    if entry.get("error"):
        return _classify_integration_error(str(entry["error"]))

    if tool == "reminder.create":
        return _summarize_reminder_create(entry)
    if tool == "reminder.update":
        return _summarize_reminder_update(entry)
    if tool == "reminder.cancel":
        return "Reminder cancelled."
    if tool == "reminder.list":
        return _summarize_reminder_list(entry)
    if tool == "automation.create":
        return _summarize_automation_create(entry)
    if tool == "automation.update":
        return _summarize_automation_update(entry)
    if tool == "automation.cancel":
        return "Automation cancelled."
    if tool in _INBOX_TOOLS:
        return _summarize_inbox_tool(entry)

    if status in ("completed", "success"):
        return "The requested action completed successfully."

    if status in ("failed", "cancelled"):
        return f"The action did not complete ({status})."

    return ""


def _summarize_reminder_create(entry: Dict[str, Any]) -> str:
    status = str(entry.get("status") or "").lower()
    if status in ("failed", "cancelled") or entry.get("error"):
        return f"Could not schedule the reminder: {entry.get('error') or status}"

    reminder = _extract_reminder(entry.get("result"))
    title = _reminder_title(reminder)
    when = reminder.get("nextFireAt")
    schedule = reminder.get("scheduleLabel")
    warning = reminder.get("scheduleWarning")
    if reminder.get("scheduled") is False and warning:
        if when:
            return (
                f"Reminder saved: {title} (next at {when}), but notification scheduling "
                f"is delayed — {warning}"
            )
        return f"Reminder saved: {title}, but notification scheduling is delayed — {warning}"
    if schedule:
        return f"Reminder scheduled: {title} ({schedule})."
    if when:
        return f"Reminder scheduled: {title} (next at {when})."
    return f"Reminder scheduled: {title}."


def _summarize_reminder_update(entry: Dict[str, Any]) -> str:
    status = str(entry.get("status") or "").lower()
    if status in ("failed", "cancelled") or entry.get("error"):
        return f"Could not update the reminder: {entry.get('error') or status}"

    reminder = _extract_reminder(entry.get("result"))
    title = _reminder_title(reminder)
    return f"Reminder updated: {title}."


def _summarize_reminder_list(entry: Dict[str, Any]) -> str:
    status = str(entry.get("status") or "").lower()
    if status in ("failed", "cancelled") or entry.get("error"):
        return f"Could not list reminders: {entry.get('error') or status}"

    result = entry.get("result")
    if not isinstance(result, dict):
        return "No pending reminders found."

    reminders = result.get("reminders")
    if not isinstance(reminders, list) or not reminders:
        return "No pending reminders found."

    lines: List[str] = []
    for r in reminders[:5]:
        if not isinstance(r, dict):
            continue
        payload = r.get("payload") if isinstance(r.get("payload"), dict) else {}
        title = payload.get("title") or "Reminder"
        next_fire = r.get("nextFireAt") or ""
        countdown = r.get("countdownLabel") or ""
        if countdown:
            lines.append(f"Next reminder: {title} in {countdown}")
        elif next_fire:
            lines.append(f"Next reminder: {title} at {next_fire}")
        else:
            lines.append(f"Reminder: {title}")

    return lines[0] if len(lines) == 1 else "; ".join(lines)


def _summarize_automation_update(entry: Dict[str, Any]) -> str:
    status = str(entry.get("status") or "").lower()
    if status in ("failed", "cancelled") or entry.get("error"):
        return f"Could not update the automation: {entry.get('error') or status}"

    result = entry.get("result")
    if not isinstance(result, dict):
        return "Automation updated."
    automation = result.get("automation")
    if not isinstance(automation, dict):
        return "Automation updated."
    name = automation.get("name") or "Automation"
    schedule = automation.get("scheduleLabel") or automation.get("schedule")
    if schedule:
        return f"Automation updated: {name} ({schedule})."
    return f"Automation updated: {name}."


def _summarize_automation_create(entry: Dict[str, Any]) -> str:
    status = str(entry.get("status") or "").lower()
    if status in ("failed", "cancelled") or entry.get("error"):
        return f"Could not create the automation: {entry.get('error') or status}"

    result = entry.get("result")
    if not isinstance(result, dict):
        return "Inbox digest automation created."
    automation = result.get("automation")
    if not isinstance(automation, dict):
        return "Inbox digest automation created."
    name = automation.get("name") or "Inbox digest"
    schedule = automation.get("scheduleLabel") or automation.get("schedule") or "daily"
    return f"Inbox digest automation created: {name} (schedule: {schedule})."


def _summarize_inbox_tool(entry: Dict[str, Any]) -> str:
    status = str(entry.get("status") or "").lower()
    if status in ("failed", "cancelled") or entry.get("error"):
        return f"Could not fetch inbox: {entry.get('error') or status}"

    payload = _unwrap_result(entry.get("result"))
    tool = str(entry.get("tool") or "")

    if "email" in tool:
        return _format_email_unread(payload)
    return _format_whatsapp_unread(payload)


def _unwrap_result(result: Any) -> Dict[str, Any]:
    if not isinstance(result, dict):
        return {}
    if isinstance(result.get("data"), dict):
        return result["data"]
    return result


def _format_email_unread(payload: Dict[str, Any]) -> str:
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        total = payload.get("totalUnread", 0)
        if total == 0:
            return "Gmail: no unread emails in inbox."
        return "Gmail: no unread email details returned."

    lines = [f"Gmail unread ({len(items)} shown):"]
    for item in items[:10]:
        if not isinstance(item, dict):
            continue
        sender = item.get("from") or item.get("sender") or "Unknown"
        subject = item.get("subject") or "(no subject)"
        preview = (item.get("preview") or item.get("snippet") or "")[:120]
        ts = item.get("timestamp") or item.get("date") or ""
        lines.append(f"  • {sender} — {subject}" + (f" ({ts})" if ts else ""))
        if preview:
            lines.append(f"    {preview}")
    return "\n".join(lines)


def _format_whatsapp_unread(payload: Dict[str, Any]) -> str:
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        total = payload.get("totalUnread", 0)
        if total == 0:
            return "WhatsApp: no unread chats."
        return "WhatsApp: no unread chat details returned."

    lines = [f"WhatsApp unread ({len(items)} chats):"]
    for item in items[:10]:
        if not isinstance(item, dict):
            continue
        name = item.get("sender") or item.get("chatName") or item.get("chatId") or "Chat"
        preview = (item.get("preview") or item.get("lastMessage") or "")[:120]
        count = item.get("unreadCount")
        suffix = f" ({count} unread)" if count else ""
        lines.append(f"  • {name}{suffix}")
        if preview:
            lines.append(f"    {preview}")
    return "\n".join(lines)


def _extract_reminder(result: Any) -> Dict[str, Any]:
    if not isinstance(result, dict):
        return {}
    reminder = result.get("reminder")
    if isinstance(reminder, dict):
        return reminder
    if result.get("nextFireAt") or result.get("payload"):
        return result
    return {}


def _reminder_title(reminder: Dict[str, Any]) -> str:
    payload = reminder.get("payload")
    if isinstance(payload, dict) and payload.get("title"):
        return str(payload["title"])
    if reminder.get("userPrompt"):
        return str(reminder["userPrompt"])
    return "Reminder"
