from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone as dt_timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None 

import httpx

from ai_http import ai_http_client, ai_request_url
from cognitive_env_loader import resolve_public_api_url
from orchestration.platform_capabilities import platform_capabilities_block
from orchestration.scheduling_relative_time import resolve_one_shot_next_fire_at
from orchestration.llm.json_parse import parse_llm_json as _parse_json
from orchestration.scheduling_timezone import (
    resolve_effective_timezone,
    resolve_timezone_hint,
)

logger = logging.getLogger(__name__)

GATEWAY_URL = resolve_public_api_url()
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")
SCHEDULING_TIMEOUT = float(os.getenv("SCHEDULING_PLANNER_TIMEOUT", "20"))

_SCHEDULING_TOOLS = frozenset(
    {
        "reminder.create",
        "reminder.update",
        "reminder.cancel",
        "reminder.list",
        "automation.create",
        "automation.update",
        "automation.cancel",
    }
)


def _coerce_reminder_from_alt_shape(
    parsed: Dict[str, Any],
    *,
    user_prompt: str,
    effective_tz: Optional[str],
) -> List[Dict[str, Any]]:
    if str(parsed.get("type") or "").lower() != "reminder":
        return []
    content = parsed.get("content")
    if not isinstance(content, dict):
        return []
    date = str(content.get("date") or "").strip()
    time_raw = str(content.get("time") or "09:00").strip()
    if not date or not effective_tz:
        return []

    if ":" not in time_raw:
        time_raw = f"{time_raw}:00"
    parts = time_raw.split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        datetime.strptime(date, "%Y-%m-%d")
    except Exception:
        return []

    if ZoneInfo is not None and effective_tz:
        try:
            tz = ZoneInfo(effective_tz)
            naive = datetime.strptime(f"{date}T{hour:02d}:{minute:02d}:00", "%Y-%m-%dT%H:%M:%S")
            next_fire = naive.replace(tzinfo=tz).isoformat(timespec="seconds")
        except Exception:
            next_fire = f"{date}T{hour:02d}:{minute:02d}:00"
    else:
        next_fire = f"{date}T{hour:02d}:{minute:02d}:00"

    title = str(content.get("title") or content.get("label") or "Reminder").strip()
    if not title or title == "Reminder":
        title_match = re.search(
            r"(?:remind(?:er)?\s+to\s+|to\s+)(.+?)(?:\s+at\b|$)",
            user_prompt,
            re.IGNORECASE,
        )
        if title_match:
            title = title_match.group(1).strip().title()

    return [
        {
            "tool": "reminder.create",
            "args": {
                "title": title,
                "userPrompt": user_prompt,
                "nextFireAt": next_fire,
                "recurrence": "NONE",
                "timezone": effective_tz,
            },
        }
    ]


def _extract_actions(parsed: Dict[str, Any]) -> List[Dict[str, Any]]:
    actions = parsed.get("actions")
    if isinstance(actions, list):
        return [a for a in actions if isinstance(a, dict)]

    tools = parsed.get("tools")
    if isinstance(tools, list):
        out: List[Dict[str, Any]] = []
        for entry in tools:
            if not isinstance(entry, dict):
                continue
            tool = entry.get("tool") or entry.get("capability")
            if tool:
                out.append(
                    {
                        "tool": tool,
                        "args": entry.get("args")
                        if isinstance(entry.get("args"), dict)
                        else {},
                    }
                )
        if out:
            return out

    tool = parsed.get("tool") or parsed.get("capability")
    if tool:
        args = parsed.get("args") if isinstance(parsed.get("args"), dict) else {}
        if not args:
            for key in (
                "title",
                "userPrompt",
                "nextFireAt",
                "recurrence",
                "cronExpression",
                "timezone",
                "query",
                "name",
            ):
                if parsed.get(key) is not None:
                    args[key] = parsed.get(key)
        return [{"tool": tool, "args": args}]

    return []


def _format_history(chat_history: Optional[List[Dict[str, str]]]) -> str:
    if not chat_history:
        return ""
    lines: List[str] = []
    for msg in chat_history[-10:]:
        role = str(msg.get("role") or "user")
        content = str(msg.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _now_iso(timezone: Optional[str]) -> str:
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo(timezone) if timezone else ZoneInfo("UTC")
            return datetime.now(tz).isoformat(timespec="seconds")
        except Exception:
            pass
    utc = datetime.now(dt_timezone.utc).isoformat(timespec="seconds")
    return f"{utc} (use device timezone {timezone or 'UTC'} for scheduling)"


def _format_pending_reminders(reminders: List[Dict[str, Any]]) -> str:
    if not reminders:
        return "No pending reminders."
    lines: List[str] = []
    for r in reminders[:12]:
        payload = r.get("payload") if isinstance(r.get("payload"), dict) else {}
        title = payload.get("title") or "Reminder"
        rid = r.get("id") or ""
        status = r.get("status") or "PENDING"
        next_fire = r.get("nextFireAt") or ""
        cron = r.get("cronExpression") or ""
        recurrence = r.get("recurrence") or "NONE"
        line = f'- id={rid} title="{title}" status={status} nextFireAt={next_fire}'
        if recurrence != "NONE" and cron:
            line += f' recurrence={recurrence} cron="{cron}"'
        lines.append(line)
    return "\n".join(lines)


async def _fetch_pending_automations(
    client: httpx.AsyncClient, user_id: str
) -> List[Dict[str, Any]]:
    try:
        res = await client.get(
            f"{GATEWAY_URL}/internal/automations",
            params={"userId": user_id},
            headers={"X-Internal-Token": INTERNAL_SERVICE_TOKEN},
            timeout=10.0,
        )
        if res.status_code >= 400:
            return []
        data = res.json()
        if isinstance(data, list):
            return data
    except Exception as exc:
        logger.warning("[scheduling_planner] fetch automations failed: %s", exc)
    return []


def _format_pending_automations(automations: List[Dict[str, Any]]) -> str:
    if not automations:
        return "No active automations."
    lines: List[str] = []
    for a in automations[:12]:
        aid = a.get("id") or ""
        name = a.get("name") or "Automation"
        schedule = a.get("schedule") or ""
        active = a.get("isActive", True)
        action = a.get("action") if isinstance(a.get("action"), dict) else {}
        query = action.get("query") or ""
        line = f'- id={aid} name="{name}" active={active} schedule="{schedule}"'
        if query:
            line += f' query="{str(query)[:80]}"'
        lines.append(line)
    return "\n".join(lines)


async def _fetch_pending_reminders(
    client: httpx.AsyncClient, user_id: str
) -> List[Dict[str, Any]]:
    try:
        res = await client.get(
            f"{GATEWAY_URL}/internal/reminders",
            params={"userId": user_id, "status": "PENDING"},
            headers={"X-Internal-Token": INTERNAL_SERVICE_TOKEN},
            timeout=10.0,
        )
        if res.status_code >= 400:
            return []
        data = res.json()
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("reminders"), list):
            return data["reminders"]
    except Exception as exc:
        logger.warning("[scheduling_planner] fetch reminders failed: %s", exc)
    return []


def _build_system_prompt(
    *,
    now_iso: str,
    device_timezone: Optional[str],
    pending_block: str,
    automations_block: str,
) -> str:
    from orchestration.prompt_loader import load_scheduling_system_prompt

    tz_note = (
        f"Device timezone: {device_timezone}. Use this IANA timezone in all schedule args unless the user explicitly overrides."
        if device_timezone
        else "Device timezone was not provided — ask for timezone via clarification if needed."
    )
    return load_scheduling_system_prompt(
        now_iso=now_iso,
        timezone_note=tz_note,
        pending_block=pending_block,
        automations_block=automations_block,
    )


_SCHEDULING_SIGNAL = re.compile(
    r"\b(remind|reminder|notify\s+me|alarm|don'?t\s+forget|"
    r"set\s+(?:a\s+)?reminder|schedule\s+(?:a\s+)?reminder|every\s+hour|"
    r"digest|automation|monitor|"
    r"delete\s+(?:the\s+)?automation|cancel\s+(?:the\s+)?automation|pause\s+(?:the\s+)?automation|"
    r"how\s+long\s+until|next\s+reminder|time\s+left)\b",
    re.IGNORECASE,
)

_AUTOMATION_SIGNAL = re.compile(
    r"\b(inbox|digest|check\s+my|monitor|summarize\s+my|scan\s+my|"
    r"every\s+(?:\d+\s+)?(?:hours?|morning|day|evening)\b|"
    r"every\s+(?:\d+\s+)?hours?\s+(?:for|to\s+check)|automation)\b",
    re.IGNORECASE,
)

_TOOL_ID_RE = re.compile(r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$", re.IGNORECASE)

_TOOL_QUERY_LABELS = {
    "email.list_unread": "Check Gmail for important unread emails",
    "messaging.list_unread": "Check WhatsApp for important unread messages",
    "whatsapp.list_unread": "Check WhatsApp for important unread messages",
}

_DEFAULT_AUTOMATION_QUERY = (
    "Check Gmail and WhatsApp for important unread items. "
    "Summarize only urgent or actionable messages. "
    "If nothing needs attention, say so briefly."
)


def _looks_like_tool_id(text: str) -> bool:
    return bool(_TOOL_ID_RE.match((text or "").strip()))


def _humanize_automation_query(query: str, user_prompt: str = "") -> str:
    q = (query or "").strip()
    if not q or not _looks_like_tool_id(q):
        return q or (user_prompt or "").strip() or _DEFAULT_AUTOMATION_QUERY
    if q in _TOOL_QUERY_LABELS:
        return _TOOL_QUERY_LABELS[q]
    up = (user_prompt or "").strip()
    if up and not _looks_like_tool_id(up):
        return up
    return _DEFAULT_AUTOMATION_QUERY


def _looks_like_automation_query(text: str) -> bool:
    return bool(_AUTOMATION_SIGNAL.search(text or ""))


def _prior_scheduling_user_message(
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    for msg in reversed(chat_history or []):
        if msg.get("role") != "user":
            continue
        content = str(msg.get("content") or "").strip()
        if content and _SCHEDULING_SIGNAL.search(content):
            return content
    return None


def _is_timezone_followup(
    query: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> bool:
    if not resolve_timezone_hint(query):
        return False
    return _prior_scheduling_user_message(chat_history) is not None


def _looks_like_scheduling_query(
    query: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> bool:
    if _SCHEDULING_SIGNAL.search(query or "") or _AUTOMATION_SIGNAL.search(query or ""):
        return True
    for msg in reversed(chat_history or []):
        if msg.get("role") != "user":
            continue
        content = str(msg.get("content") or "")
        if _SCHEDULING_SIGNAL.search(content) or _AUTOMATION_SIGNAL.search(content):
            return True
    return False


looks_like_scheduling_query = _looks_like_scheduling_query


def should_run_scheduling_planner(
    query: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> bool:
    """True when the scheduling LLM should run (reminders, automations, timezone follow-ups)."""
    return _looks_like_scheduling_query(query, chat_history) or _is_timezone_followup(
        query, chat_history
    )


def _normalize_action(action: Dict[str, Any], effective_tz: Optional[str]) -> Optional[Dict[str, Any]]:
    tool = str(action.get("tool") or "").strip()
    if tool not in _SCHEDULING_TOOLS:
        return None
    args = action.get("args")
    if not isinstance(args, dict):
        return None

    out_args = dict(args)
    if tool.startswith("reminder.") and tool != "reminder.list":
        if effective_tz and not out_args.get("timezone"):
            out_args["timezone"] = effective_tz
        if not out_args.get("title") and out_args.get("userPrompt"):
            out_args["title"] = str(out_args["userPrompt"])[:80]
        if tool == "reminder.create" and effective_tz:
            user_prompt = str(out_args.get("userPrompt") or "")
            relative_fire = resolve_one_shot_next_fire_at(user_prompt, effective_tz)
            if relative_fire:
                out_args["nextFireAt"] = relative_fire
                if not out_args.get("recurrence"):
                    out_args["recurrence"] = "NONE"
    if tool.startswith("automation."):
        if effective_tz and not out_args.get("timezone"):
            out_args["timezone"] = effective_tz
        if out_args.get("schedule") and not out_args.get("cronExpression"):
            out_args["cronExpression"] = out_args.pop("schedule")
        if out_args.get("query"):
            out_args["query"] = _humanize_automation_query(
                str(out_args.get("query") or ""),
                str(out_args.get("userPrompt") or ""),
            )

    return {"tool": tool, "args": out_args}


async def plan_scheduling_actions(
    query: str,
    *,
    user_id: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
    timezone: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Optional[str], bool, List[str]]:
    trimmed = (query or "").strip()
    if not trimmed:
        return [], None, False, []

    history = chat_history or []
    if not should_run_scheduling_planner(trimmed, history):
        return [], None, False, []

    effective_tz = resolve_effective_timezone(timezone, trimmed, history)
    now_iso = _now_iso(effective_tz)

    warnings: List[str] = []
    async with httpx.AsyncClient(timeout=SCHEDULING_TIMEOUT) as gw_client:
        pending = await _fetch_pending_reminders(gw_client, user_id)
        automations = await _fetch_pending_automations(gw_client, user_id)

    system = _build_system_prompt(
        now_iso=now_iso,
        device_timezone=effective_tz,
        pending_block=_format_pending_reminders(pending),
        automations_block=_format_pending_automations(automations),
    )
    history_block = _format_history(history)
    user_content = trimmed
    if _is_timezone_followup(trimmed, history):
        prior = _prior_scheduling_user_message(history) or trimmed
        tz_hint = resolve_timezone_hint(trimmed) or effective_tz or "UTC"
        if _looks_like_automation_query(prior):
            tool_hint = (
                "Return automation.create with cronExpression, timezone, and query "
                f"(what to check). timezone {tz_hint}."
            )
        else:
            tool_hint = (
                "Return reminder.create with structured nextFireAt, recurrence NONE unless recurring, "
                f"timezone {tz_hint}."
            )
        user_content = (
            "Merge and schedule now — do not ask more questions.\n"
            f"Original request: {prior}\n"
            f"User clarified timezone: {tz_hint}\n"
            f"{tool_hint}"
        )
    elif history_block:
        user_content = f"Recent conversation:\n{history_block}\n\nLatest user message: {trimmed}"

    raw_text = ""
    try:
        async with ai_http_client(timeout=SCHEDULING_TIMEOUT) as client:
            res = await client.post(
                ai_request_url("/v1/chat/complete"),
                json={
                    "query": f"{user_content}\n\nReturn ONLY valid JSON:",
                    "rag_enabled": False,
                    "chat_history": [],
                    "user_id": user_id,
                    "task": "planner",
                    "system_prompt": system,
                },
            )
            res.raise_for_status()
            payload = res.json()
            raw_text = str(payload.get("text") or payload.get("content") or "")
            logger.info(
                "[scheduling_planner] model=%s raw_len=%s",
                payload.get("model_used"),
                len(raw_text),
            )
    except Exception as exc:
        logger.warning("[scheduling_planner] LLM call failed: %s", exc)
        warnings.append("Scheduling planner unavailable — try again.")
        intent = _looks_like_scheduling_query(trimmed, history)
        return [], None, intent, warnings

    parsed = _parse_json(raw_text)
    if not parsed and raw_text:
        logger.warning(
            "[scheduling_planner] could not parse JSON (preview=%s)",
            raw_text[:300].replace("\n", " "),
        )

    clarification = parsed.get("clarification")
    if isinstance(clarification, str):
        clarification = clarification.strip() or None
    else:
        clarification = None

    scheduling_intent = bool(parsed.get("schedulingIntent"))
    likely_scheduling = _looks_like_scheduling_query(trimmed, history)

    if clarification and _is_timezone_followup(trimmed, history):
        clarification = None
        scheduling_intent = True
        warnings.append(
            "Could not merge timezone follow-up into a schedule — ask the user to repeat the full request."
        )
    elif clarification:
        return [], clarification, scheduling_intent or likely_scheduling, warnings

    items: List[Dict[str, Any]] = []
    for action in _extract_actions(parsed) + _coerce_reminder_from_alt_shape(
        parsed, user_prompt=user_content, effective_tz=effective_tz
    ):
        normalized = _normalize_action(action, effective_tz)
        if normalized:
            items.append(normalized)

    if not items and likely_scheduling:
        scheduling_intent = True
        if raw_text:
            warnings.append(
                "Scheduling planner returned no structured actions — ask the user to rephrase."
            )

    return items, None, scheduling_intent, warnings
