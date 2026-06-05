
from __future__ import annotations

from typing import Any, Dict, List

_TOOL_REPLY_INSTRUCTION = (
    "Reply in one short, friendly sentence. "
    "If scheduling succeeded, confirm the reminder title and time. "
    "If it failed, state that briefly and ask the user to try again — do not claim "
    "the system is broken or suggest phone alarms unless scheduling actually failed. "
    "Never mention tool names, execution IDs, JSON, Python dicts, or raw metadata."
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
        return f"Could not complete the request: {entry['error']}"

    if tool == "reminder.create":
        return _summarize_reminder_create(entry)
    if tool == "reminder.update":
        return _summarize_reminder_update(entry)
    if tool == "reminder.cancel":
        return "Reminder cancelled."

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
