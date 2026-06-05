
from __future__ import annotations

from typing import Any, Dict, List, Optional

from orchestration.reminder_intent import is_timed_remind_intent


def plan_reminder_action(
    intent_text: str,
    *,
    user_prompt: Optional[str] = None,
    timezone: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return a single reminder.create plan item, or empty if not a timed remind intent."""
    trimmed = (intent_text or "").strip()
    if not trimmed or not is_timed_remind_intent(trimmed):
        return []

    prompt = (user_prompt or intent_text).strip()
    args: Dict[str, Any] = {"userPrompt": prompt}
    tz = (timezone or "").strip()
    if tz:
        args["timezone"] = tz
    return [{"tool": "reminder.create", "args": args}]
