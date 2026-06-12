
from __future__ import annotations

import os
from typing import Any, Dict

import httpx

from cognitive_env_loader import resolve_internal_gateway_url
from orchestration.gateway_client import (
    gateway_error_message,
    internal_headers,
    omit_none,
)
from orchestration.scheduling_timezone import resolve_effective_timezone, resolve_timezone_hint

GATEWAY_URL = resolve_internal_gateway_url()


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
            json=omit_none(
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
            headers=internal_headers(),
        )
        if res.status_code >= 400:
            try:
                err = res.json()
                msg = gateway_error_message(err, res.text)
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
            json=omit_none(
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
            headers=internal_headers(),
        )
        if res.status_code >= 400:
            try:
                err = res.json()
                msg = gateway_error_message(err, res.text)
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
            json=omit_none(
                {
                    "userId": user_id,
                    "reminderId": args.get("reminderId"),
                    "title": args.get("title"),
                }
            ),
            headers=internal_headers(),
        )
        if res.status_code >= 400 and res.status_code != 204:
            try:
                err = res.json()
                msg = gateway_error_message(err, res.text)
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
            headers=internal_headers(),
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
