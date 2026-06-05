
from __future__ import annotations

PLATFORM_CAPABILITIES_TEXT = """Platform scheduling tools (always available — no Connect Apps required):

REMINDER vs AUTOMATION — choose the correct tool:
- reminder.create: notification ONLY. User wants to be nudged at a time (call mom, drink water, take medicine). No agent work, no inbox checks.
- automation.create: recurring TASK. Assistant runs work on a schedule, posts results in a new chat, and sends a notification. Use for inbox/digest/monitor/check requests.

- reminder.create REQUIRED args: title, userPrompt, nextFireAt (ISO 8601 with offset), recurrence, timezone (IANA). Include cronExpression when recurring.
- reminder.update / reminder.cancel: change or remove existing reminders (use pending reminder list for ids/titles).
- reminder.list: answer status or countdown questions ("how long until my next reminder?").
- automation.create REQUIRED args: cronExpression, timezone, query (plain English, e.g. "Check my Gmail for urgent unread emails" — NOT tool IDs like email.list_unread). Optional name/pushTitle.
- automation.update / automation.cancel: change or remove existing automations (match by name or automationId from pending list).

Never use reminder.create for "check my inbox", "digest", or "monitor every X hours" — use automation.create.
Never use automation.create for simple "remind me at 9pm" — use reminder.create.

When connected apps are listed below, you may also check Gmail (email.list_unread) and WhatsApp (messaging.list_unread) in live chat — that is separate from scheduling automations."""


def platform_capabilities_block() -> str:
    return PLATFORM_CAPABILITIES_TEXT
