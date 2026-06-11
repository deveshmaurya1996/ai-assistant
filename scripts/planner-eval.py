from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "cognitive-runtime"))

from cognitive_env_loader import load_service_env

load_service_env()


def _parse_cases(raw: str) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    expect: dict[str, Any] | None = None
    in_expect = False
    in_states = False
    in_history = False
    states: list[dict[str, str]] = []
    history: list[dict[str, str]] = []

    for line in raw.splitlines():
        if line.startswith("- id:"):
            if current:
                if expect:
                    current["expect"] = expect
                if states:
                    current["connection_states"] = states
                if history:
                    current["chat_history"] = history
                cases.append(current)
            current = {"id": line.split(":", 1)[1].strip()}
            expect = None
            in_expect = False
            in_states = False
            in_history = False
            states = []
            history = []
            continue
        if current is None:
            continue
        if line.startswith("  connected:"):
            inner = line.split("[", 1)[1].split("]", 1)[0]
            current["connected"] = [p.strip() for p in inner.split(",") if p.strip()]
        elif line.startswith("  query:"):
            current["query"] = line.split(":", 1)[1].strip().strip('"')
        elif line.startswith("  routing_query:"):
            current["routing_query"] = line.split(":", 1)[1].strip().strip('"')
        elif line.startswith("  timezone:"):
            current["timezone"] = line.split(":", 1)[1].strip()
        elif line.startswith("  force_planner:"):
            current["force_planner"] = line.split(":", 1)[1].strip()
        elif line.startswith("  mock_llm:"):
            current["mock_llm"] = line.split(":", 1)[1].strip()
        elif line.startswith("  connection_states:"):
            in_states = True
            in_history = False
        elif line.startswith("  chat_history:"):
            in_history = True
            in_states = False
        elif in_states and line.strip().startswith("- providerId:"):
            pid = line.split(":", 1)[1].strip()
            states.append({"providerId": pid, "state": "not_connected"})
        elif in_states and line.strip().startswith("state:"):
            if states:
                states[-1]["state"] = line.split(":", 1)[1].strip()
        elif in_history and line.strip().startswith("- role:"):
            history.append({"role": line.split(":", 1)[1].strip()})
        elif in_history and line.strip().startswith("content:"):
            if history:
                history[-1]["content"] = line.split(":", 1)[1].strip().strip('"')
        elif line.startswith("  expect:"):
            expect = {}
            in_expect = True
            in_states = False
            in_history = False
        elif in_expect and line.startswith("    planner:"):
            expect["planner"] = line.split(":", 1)[1].strip()
        elif in_expect and line.startswith("    tools:"):
            inner = line.split("[", 1)[1].split("]", 1)[0]
            expect["tools"] = [t.strip() for t in inner.split(",") if t.strip()]
        elif in_expect and line.startswith("    must_not:"):
            inner = line.split("[", 1)[1].split("]", 1)[0]
            expect["must_not"] = [t.strip() for t in inner.split(",") if t.strip()]

    if current:
        if expect:
            current["expect"] = expect
        if states:
            current["connection_states"] = states
        if history:
            current["chat_history"] = history
        cases.append(current)
    return cases


def _cap_set_for_connected(connected: list[str]) -> set[str]:
    mapping = {
        "whatsapp": {
            "messaging.list_unread",
            "messaging.send_message",
            "messaging.search_chats",
            "messaging.read_chat",
            "communication.chat.search",
        },
        "google": {
            "email.list_unread",
            "email.search",
            "calendar.list_upcoming",
            "calendar.cancel_event",
            "drive.search",
            "drive.get_content",
        },
        "platform": {"image.edit", "resources.search"},
    }
    caps: set[str] = set()
    for provider in connected:
        caps |= mapping.get(provider, set())
    caps |= mapping.get("platform", set())
    return caps


def _load_mock_llm(fixture_rel: str) -> str:
    path = ROOT / "evals" / "planner" / fixture_rel
    data = json.loads(path.read_text(encoding="utf-8"))
    return str(data.get("text", ""))


async def _run_case(case: dict[str, Any]) -> tuple[bool, str]:
    from orchestration.planner import plan_tools

    connected = case.get("connected", [])
    connections = [{"id": f"{p}_eval", "providerId": p} for p in connected]
    states = case.get("connection_states")
    if not states:
        states = [{"providerId": p, "state": "ready"} for p in connected]
    caps = _cap_set_for_connected(connected)
    force_planner = case.get("force_planner")
    skip_heuristics = force_planner in ("capability-llm", "llm-scheduling")

    mock_fixture = case.get("mock_llm")
    if mock_fixture:
        os.environ.setdefault("PLANNER_MODEL", "eval-mock")
    patches = []
    if mock_fixture:
        raw = _load_mock_llm(mock_fixture)
        mock_complete = AsyncMock(return_value=(raw, "eval-mock", {}))
        patches.append(
            patch("orchestration.capability_llm.complete_planner", mock_complete)
        )

    ctx = patches[0] if patches else None
    try:
        if ctx:
            ctx.__enter__()
        result = await plan_tools(
            case["query"],
            "Eval context with drive.search and drive.get_content capabilities.",
            "eval-user",
            manifest_caps=caps,
            manifest_connections=connections,
            manifest_connection_states=states,
            timezone=case.get("timezone"),
            routing_query=case.get("routing_query"),
            chat_history=case.get("chat_history"),
            skip_heuristics=skip_heuristics,
            force_planner=force_planner,
        )
    finally:
        if ctx:
            ctx.__exit__(None, None, None)

    expect = case.get("expect", {})
    errors: list[str] = []

    if "planner" in expect and result.get("planner") != expect["planner"]:
        errors.append(f"planner={result.get('planner')!r} expected {expect['planner']!r}")

    tool_names = [t.get("tool") for t in result.get("tools", [])]
    for tool in expect.get("tools", []):
        if tool not in tool_names:
            errors.append(f"missing tool {tool!r} in {tool_names}")
    for tool in expect.get("must_not", []):
        if tool in tool_names:
            errors.append(f"forbidden tool {tool!r} present in {tool_names}")

    if errors:
        return False, "; ".join(errors)
    return True, "ok"


def _collect_cases(mode: str) -> list[dict[str, Any]]:
    eval_dir = ROOT / "evals" / "planner"
    files = ["cases.yaml"]
    if mode in ("fixture", "live"):
        files.extend(["cases-capability.yaml", "cases-scheduling.yaml"])
    cases: list[dict[str, Any]] = []
    for name in files:
        path = eval_dir / name
        if path.exists():
            cases.extend(_parse_cases(path.read_text(encoding="utf-8")))
    if mode == "heuristic":
        cases = [c for c in cases if not c.get("mock_llm")]
        cases = [c for c in cases if c.get("expect", {}).get("planner") != "capability-llm"]
    if mode == "fixture":
        cases = [c for c in cases if c.get("mock_llm") or c.get("force_planner")]
    return cases


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=["heuristic", "fixture", "live"],
        default="heuristic",
    )
    args = parser.parse_args()

    if args.mode == "live" and os.getenv("PLANNER_EVAL_LIVE") != "1":
        print("Set PLANNER_EVAL_LIVE=1 to run live LLM eval cases")
        return 1

    cases = _collect_cases(args.mode)
    if not cases:
        print(f"No cases for mode={args.mode}")
        return 1

    passed = 0
    failed = 0
    for case in cases:
        ok, detail = await _run_case(case)
        if ok:
            passed += 1
            print(f"PASS {case['id']}")
        else:
            failed += 1
            print(f"FAIL {case['id']}: {detail}")

    total = passed + failed
    print(f"\n{passed}/{total} passed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
