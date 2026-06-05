
from __future__ import annotations

import os
from typing import Any, Dict

import httpx

from env_loader import resolve_public_api_url
from orchestration.scheduling_timezone import resolve_effective_timezone, resolve_timezone_hint

GATEWAY_URL = resolve_public_api_url()
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")


def _internal_headers() -> Dict[str, str]:
    return {"X-Internal-Token": INTERNAL_SERVICE_TOKEN}


def _omit_none(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def _gateway_error_message(err: Any, fallback: str) -> str:
    if not isinstance(err, dict):
        return fallback
    msg = str(err.get("error") or fallback)
    details = err.get("details")
    if isinstance(details, list) and details:
        first = details[0]
        if isinstance(first, dict) and first.get("message"):
            return f"{msg}: {first['message']}"
    return msg


async def execute_reminder_via_gateway(
    client: httpx.AsyncClient,
    user_id: str,
    tool_name: str,
    args: Dict[str, Any],
) -> Dict[str, Any]:
    """Create, update, cancel, or list reminders via gateway /internal/reminders."""
    if tool_name == "reminder.create":
        user_prompt = args.get("userPrompt")
        tz = resolve_effective_timezone(
            args.get("timezone"),
            str(user_prompt or ""),
        )
        if not tz:
            hint = resolve_timezone_hint(str(user_prompt or ""))
            if hint:
                tz = hint
        if not tz:
            return {
                "tool": tool_name,
                "status": "failed",
                "error": (
                    "Device timezone is required to schedule reminders. "
                    "Reload the app and try again."
                ),
            }
        res = await client.post(
            f"{GATEWAY_URL}/internal/reminders",
            json=_omit_none(
                {
                    "userId": user_id,
                    "title": args.get("title") or user_prompt or "Reminder",
                    "body": args.get("body"),
                    "userPrompt": user_prompt,
                    "nextFireAt": args.get("nextFireAt"),
                    "recurrence": args.get("recurrence"),
                    "cronExpression": args.get("cronExpression"),
                    "timezone": tz,
                }
            ),
            headers=_internal_headers(),
        )
        if res.status_code >= 400:
            try:
                err = res.json()
                msg = _gateway_error_message(err, res.text)
            except Exception:
                msg = res.text
            return {"tool": tool_name, "status": "failed", "error": msg}
        data = res.json()
        return {
            "tool": tool_name,
            "status": "completed",
            "result": {"type": "reminder.created", "reminder": data},
        }

    if tool_name == "reminder.update":
        update_tz = resolve_effective_timezone(
            args.get("timezone"),
            str(args.get("userPrompt") or ""),
        )
        res = await client.patch(
            f"{GATEWAY_URL}/internal/reminders",
            json=_omit_none(
                {
                    "userId": user_id,
                    "reminderId": args.get("reminderId"),
                    "title": args.get("title"),
                    "body": args.get("body"),
                    "userPrompt": args.get("userPrompt"),
                    "nextFireAt": args.get("nextFireAt"),
                    "recurrence": args.get("recurrence"),
                    "cronExpression": args.get("cronExpression"),
                    "timezone": update_tz or args.get("timezone"),
                    "status": args.get("status"),
                }
            ),
            headers=_internal_headers(),
        )
        if res.status_code >= 400:
            try:
                err = res.json()
                msg = _gateway_error_message(err, res.text)
            except Exception:
                msg = res.text
            return {"tool": tool_name, "status": "failed", "error": msg}
        data = res.json()
        return {
            "tool": tool_name,
            "status": "completed",
            "result": {"type": "reminder.updated", "reminder": data},
        }

    if tool_name == "reminder.cancel":
        res = await client.request(
            "DELETE",
            f"{GATEWAY_URL}/internal/reminders",
            json=_omit_none(
                {
                    "userId": user_id,
                    "reminderId": args.get("reminderId"),
                    "title": args.get("title"),
                }
            ),
            headers=_internal_headers(),
        )
        if res.status_code >= 400 and res.status_code != 204:
            try:
                err = res.json()
                msg = _gateway_error_message(err, res.text)
            except Exception:
                msg = res.text
            return {"tool": tool_name, "status": "failed", "error": msg}
        return {
            "tool": tool_name,
            "status": "completed",
            "result": {"type": "reminder.cancelled"},
        }

    if tool_name == "reminder.list":
        params: Dict[str, str] = {"userId": user_id}
        if args.get("status"):
            params["status"] = str(args["status"])
        if args.get("title"):
            params["title"] = str(args["title"])
        res = await client.get(
            f"{GATEWAY_URL}/internal/reminders",
            params=params,
            headers=_internal_headers(),
        )
        if res.status_code >= 400:
            try:
                err = res.json()
                msg = err.get("error") if isinstance(err, dict) else res.text
            except Exception:
                msg = res.text
            return {"tool": tool_name, "status": "failed", "error": msg}
        data = res.json()
        reminders = data if isinstance(data, list) else data.get("reminders", [])
        return {
            "tool": tool_name,
            "status": "completed",
            "result": {"type": "reminder.list_result", "reminders": reminders},
        }

    return {
        "tool": tool_name,
        "status": "failed",
        "error": f"Unknown reminder tool: {tool_name}",
    }
