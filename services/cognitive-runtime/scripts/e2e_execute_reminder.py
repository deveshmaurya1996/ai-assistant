"""Execute reminder.create end-to-end (LLM plan + gateway) without stream LLM."""

from __future__ import annotations

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cognitive_env_loader import load_service_env

load_service_env()

from orchestration.executor import execute_planned_tools
from orchestration.planner import plan_tools
from orchestration.turn_router import TurnIntent, classify_turn


async def main() -> int:
    user_id = os.getenv("E2E_USER_ID", "0aZyi8WK7UHdA2rVCRgxul38YVvdWTK9")
    tz = "Asia/Kolkata"
    q1 = "hey schedule a reminder to call my mom at 9 pm"
    history = [
        {"role": "user", "content": q1},
        {
            "role": "assistant",
            "content": (
                "Hi! I couldn't schedule that reminder—could you tell me your "
                "time zone (and whether \"9 pm\" is today)?"
            ),
        },
    ]

    print("=== Turn 1 (LLM plan) ===")
    route1 = classify_turn(
        query=q1,
        chat_history=[],
        confirmed=False,
        skip_planning=False,
        rag_enabled=False,
        attachments=[],
        resolved_attachments=[],
        has_file_context=False,
    )
    print(f"route: {route1.intent.value} run_tools={route1.run_tools}")
    plan1 = await plan_tools(q1, "", user_id, timezone=tz, chat_history=[])
    tools1 = plan1.get("tools") or []
    print(f"planner: {plan1.get('planner')}")
    print(f"plan: {json.dumps(tools1, indent=2)}")
    results1 = await execute_planned_tools(
        tools1, user_id=user_id, source="chat", confirmed=False
    )
    print(f"results: {json.dumps(results1, indent=2, default=str)}")

    print("\n=== Turn 2 (ist, LLM plan) ===")
    route2 = classify_turn(
        query="ist",
        chat_history=history,
        confirmed=False,
        skip_planning=False,
        rag_enabled=False,
        attachments=[],
        resolved_attachments=[],
        has_file_context=False,
    )
    print(f"route: {route2.intent.value} run_tools={route2.run_tools}")
    assert route2.intent == TurnIntent.TOOL, "ist should route to TOOL"

    plan2 = await plan_tools("ist", "", user_id, timezone=tz, chat_history=history)
    tools2 = plan2.get("tools") or []
    print(f"planner: {plan2.get('planner')}")
    print(f"plan: {json.dumps(tools2, indent=2)}")
    results2 = await execute_planned_tools(
        tools2, user_id=user_id, source="chat", confirmed=False
    )
    print(f"results: {json.dumps(results2, indent=2, default=str)}")

    ok1 = results1 and results1[0].get("status") == "completed"
    ok2 = results2 and results2[0].get("status") == "completed"
    print("\nPASSED" if ok1 and ok2 else "\nFAILED")
    return 0 if ok1 and ok2 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
