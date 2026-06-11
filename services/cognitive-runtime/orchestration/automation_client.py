
from __future__ import annotations

import os
from typing import Any, Dict

import httpx

from cognitive_env_loader import resolve_public_api_url
from orchestration.gateway_client import (
    gateway_error_message,
    internal_headers,
    omit_none,
)
from orchestration.scheduling_timezone import resolve_effective_timezone

GATEWAY_URL = resolve_public_api_url()


async def execute_automation_via_gateway(
    client: httpx.AsyncClient,
    user_id: str,
    tool_name: str,
    args: Dict[str, Any],
) -> Dict[str, Any]:
    if tool_name == "automation.create":
        cron = args.get("cronExpression") or args.get("schedule")
        if not cron:
            return {
                "tool": tool_name,
                "status": "failed",
                "error": "cronExpression is required for automations",
            }
        tz = resolve_effective_timezone(
            args.get("timezone"),
            str(args.get("userPrompt") or ""),
        )
        if not tz:
            return {
                "tool": tool_name,
                "status": "failed",
                "error": "timezone is required for automations",
            }
        query = args.get("query")
        if not query:
            return {
                "tool": tool_name,
                "status": "failed",
                "error": "query is required for automations",
            }
        res = await client.post(
            f"{GATEWAY_URL}/internal/automations",
            json=omit_none(
                {
                    "userId": user_id,
                    "name": args.get("name") or args.get("pushTitle") or "Inbox digest",
                    "cronExpression": cron,
                    "timezone": tz,
                    "query": query,
                    "userPrompt": args.get("userPrompt"),
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
            "result": {"type": "automation.created", "automation": data},
        }

    if tool_name == "automation.update":
        update_tz = resolve_effective_timezone(
            args.get("timezone"),
            str(args.get("userPrompt") or ""),
        )
        res = await client.patch(
            f"{GATEWAY_URL}/internal/automations",
            json=omit_none(
                {
                    "userId": user_id,
                    "automationId": args.get("automationId"),
                    "name": args.get("name") or args.get("pushTitle"),
                    "title": args.get("title"),
                    "cronExpression": args.get("cronExpression") or args.get("schedule"),
                    "timezone": update_tz or args.get("timezone"),
                    "query": args.get("query"),
                    "isActive": args.get("isActive"),
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
            "result": {"type": "automation.updated", "automation": data},
        }

    if tool_name == "automation.cancel":
        res = await client.request(
            "DELETE",
            f"{GATEWAY_URL}/internal/automations",
            json=omit_none(
                {
                    "userId": user_id,
                    "automationId": args.get("automationId"),
                    "name": args.get("name") or args.get("title"),
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
            "result": {"type": "automation.cancelled"},
        }

    return {
        "tool": tool_name,
        "status": "failed",
        "error": f"Unknown automation tool: {tool_name}",
    }
