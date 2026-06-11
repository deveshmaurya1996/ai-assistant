
from __future__ import annotations

import asyncio
import json
import os
import sys

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from cognitive_env_loader import load_service_env

load_service_env()

COGNITIVE = os.getenv("INTELLIGENCE_UPSTREAM_URL", "http://127.0.0.1:8000")
GATEWAY = os.getenv("API_PUBLIC_URL", "http://localhost:3000")
USER_ID = os.getenv("E2E_USER_ID", "0aZyi8WK7UHdA2rVCRgxul38YVvdWTK9")
TZ = "Asia/Kolkata"
TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")


async def plan(query: str, history: list[dict[str, str]] | None = None) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{COGNITIVE}/v1/agent/plan",
            json={
                "query": query,
                "routing_query": query,
                "user_id": USER_ID,
                "chat_history": history or [],
                "timezone": TZ,
            },
        )
        res.raise_for_status()
        return res.json()


async def list_reminders() -> list:
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{GATEWAY}/internal/reminders",
            params={"userId": USER_ID, "status": "PENDING"},
            headers={"X-Internal-Token": TOKEN},
        )
        res.raise_for_status()
        data = res.json()
        return data if isinstance(data, list) else []


async def main() -> int:
    before = await list_reminders()
    print(f"Pending reminders before: {len(before)}")

    q1 = "hey schedule a reminder to call my mom at 9 pm"
    plan1 = await plan(q1)
    print("\n=== Plan 1 ===")
    print(json.dumps(plan1, indent=2, ensure_ascii=True))

    from orchestration.executor import execute_planned_tools

    tools1 = plan1.get("tools") or []
    results1 = await execute_planned_tools(
        tools1, user_id=USER_ID, source="chat", confirmed=False
    )
    print("\n=== Results 1 ===")
    print(json.dumps(results1, indent=2, ensure_ascii=True, default=str))

    after1 = await list_reminders()
    print(f"\nPending reminders after turn 1: {len(after1)}")

    ok1 = (
        plan1.get("planner") == "llm-scheduling"
        and tools1
        and results1
        and results1[0].get("status") == "completed"
        and len(after1) > len(before)
    )
    print("TURN1:", "PASS" if ok1 else "FAIL")
    return 0 if ok1 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
