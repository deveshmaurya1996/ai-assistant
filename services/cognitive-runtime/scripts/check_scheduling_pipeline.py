
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orchestration.planner import plan_tools
from orchestration.turn_router import classify_turn


USER_ID = os.getenv("CHECK_SCHEDULING_USER_ID", "0aZyi8WK7UHdA2rVCRgxul38YVvdWTK9")
TZ = os.getenv("CHECK_SCHEDULING_TZ", "Asia/Kolkata")


def check_router_cases() -> list[str]:
    errors: list[str] = []
    cases = [
        ("remind me at 9pm to call mom", True),
        ("schedule a reminder to drink water every hour from 9 AM to 5 PM", True),
        ("how long until my next water reminder?", True),
        ("check my inbox every morning at 8", True),
        ("delete my inbox digest automation", True),
        ("cancel the water reminder", True),
        ("hello there", False),
    ]
    for text, expect_tool in cases:
        route = classify_turn(
            query=text,
            confirmed=False,
            skip_planning=False,
            rag_enabled=False,
            attachments=[],
            resolved_attachments=[],
            has_file_context=False,
        )
        got_tool = route.intent.value == "tool"
        if got_tool != expect_tool:
            errors.append(f"router {text!r}: expected tool={expect_tool}, got {route.intent}")
    return errors


async def check_llm_plan_tools(live: bool) -> list[str]:
    if not live:
        return []

    errors: list[str] = []
    history: list[dict[str, str]] = []

    async def run_turn(text: str, hist: list[dict[str, str]] | None = None) -> dict:
        return await plan_tools(
            text,
            "",
            USER_ID,
            timezone=TZ,
            chat_history=hist or [],
        )

    plan1 = await run_turn("schedule a reminder to drink water every hour from 9 AM to 5 PM")
    if plan1.get("planner") not in ("llm-scheduling", "llm-scheduling-clarification"):
        errors.append(f"hourly window planner={plan1.get('planner')!r}")
    tools1 = plan1.get("tools") or []
    if plan1.get("planner") == "llm-scheduling" and not tools1:
        errors.append("hourly window: expected tools")

    history = [
        {"role": "user", "content": "remind me every hour to drink water"},
        {
            "role": "assistant",
            "content": "What time should the first reminder be?",
        },
        {"role": "user", "content": "yes set it from 9 AM to 5 PM"},
    ]
    plan2 = await run_turn("yes set it from 9 AM to 5 PM", history)
    if plan2.get("planner") not in ("llm-scheduling", "llm-scheduling-clarification"):
        errors.append(f"follow-up planner={plan2.get('planner')!r}")

    plan3 = await run_turn("how long until my next water reminder?")
    if plan3.get("planner") == "llm-scheduling":
        tool_names = [t.get("tool") for t in (plan3.get("tools") or [])]
        if "reminder.list" not in tool_names:
            errors.append(f"status query tools={tool_names!r}, expected reminder.list")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="Run live LLM plan_tools checks")
    args = parser.parse_args()

    errors = check_router_cases()
    errors.extend(asyncio.run(check_llm_plan_tools(args.live)))

    if errors:
        print("FAIL")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("OK scheduling pipeline checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
