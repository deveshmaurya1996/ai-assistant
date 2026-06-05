
from __future__ import annotations

import os
from typing import Any, Dict

import httpx

from env_loader import resolve_public_api_url

GATEWAY_URL = resolve_public_api_url()
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")


def _internal_headers() -> Dict[str, str]:
    return {"X-Internal-Token": INTERNAL_SERVICE_TOKEN}


async def execute_reminder_via_gateway(
    client: httpx.AsyncClient,
    user_id: str,
    tool_name: str,
    args: Dict[str, Any],
) -> Dict[str, Any]:
    """Create, update, or cancel reminders via gateway /internal/reminders."""
    if tool_name == "reminder.create":
        user_prompt = args.get("userPrompt")
        if not (args.get("timezone") or "").strip():
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
            json={
                "userId": user_id,
                "title": user_prompt or args.get("title") or "Reminder",
                "body": args.get("body"),
                "userPrompt": user_prompt,
                "nextFireAt": args.get("nextFireAt"),
                "recurrence": args.get("recurrence"),
                "cronExpression": args.get("cronExpression"),
                "timezone": args.get("timezone"),
            },
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
        return {
            "tool": tool_name,
            "status": "completed",
            "result": {"type": "reminder.created", "reminder": data},
        }

    if tool_name == "reminder.update":
        res = await client.patch(
            f"{GATEWAY_URL}/internal/reminders",
            json={
                "userId": user_id,
                "reminderId": args.get("reminderId"),
                "title": args.get("title"),
                "body": args.get("body"),
                "userPrompt": args.get("userPrompt"),
                "nextFireAt": args.get("nextFireAt"),
                "recurrence": args.get("recurrence"),
                "cronExpression": args.get("cronExpression"),
                "timezone": args.get("timezone"),
                "status": args.get("status"),
            },
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
        return {
            "tool": tool_name,
            "status": "completed",
            "result": {"type": "reminder.updated", "reminder": data},
        }

    if tool_name == "reminder.cancel":
        res = await client.request(
            "DELETE",
            f"{GATEWAY_URL}/internal/reminders",
            json={
                "userId": user_id,
                "reminderId": args.get("reminderId"),
                "title": args.get("title"),
            },
            headers=_internal_headers(),
        )
        if res.status_code >= 400 and res.status_code != 204:
            try:
                err = res.json()
                msg = err.get("error") if isinstance(err, dict) else res.text
            except Exception:
                msg = res.text
            return {"tool": tool_name, "status": "failed", "error": msg}
        return {
            "tool": tool_name,
            "status": "completed",
            "result": {"type": "reminder.cancelled"},
        }

    return {
        "tool": tool_name,
        "status": "failed",
        "error": f"Unknown reminder tool: {tool_name}",
    }
