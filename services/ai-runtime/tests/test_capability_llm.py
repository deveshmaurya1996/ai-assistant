import pytest
from unittest.mock import AsyncMock, patch

from orchestration.capability_llm import llm_plan_capabilities
from orchestration.types import PlanTrace


@pytest.mark.asyncio
async def test_llm_plan_capabilities_parses_mock_response():
    trace = PlanTrace()
    raw = (
        '{"capabilities":[{"capability":"drive.search",'
        '"args":{"query":"budget"},"provider":"google"}]}'
    )
    with patch("orchestration.capability_llm.get_planner_model", return_value="mock"):
        with patch(
            "orchestration.capability_llm.complete_planner",
            AsyncMock(return_value=(raw, "mock-model", {})),
        ):
            items, model, warnings = await llm_plan_capabilities(
                "find budget in drive",
                "Context with drive.search",
                "user-1",
                {"drive.search"},
                {"google"},
                trace,
            )
    assert not warnings
    assert model == "mock-model"
    assert items[0]["capability"] == "drive.search"
    assert any(s.name == "capability_llm" for s in trace.stages)


@pytest.mark.asyncio
async def test_llm_plan_capabilities_filters_unknown_caps():
    trace = PlanTrace()
    raw = '{"capabilities":[{"capability":"email.list_unread","provider":"google"}]}'
    with patch("orchestration.capability_llm.get_planner_model", return_value="mock"):
        with patch(
            "orchestration.capability_llm.complete_planner",
            AsyncMock(return_value=(raw, "mock-model", {})),
        ):
            items, _, _ = await llm_plan_capabilities(
                "check email",
                "ctx",
                "user-1",
                {"drive.search"},
                {"google"},
                trace,
            )
    assert items == []
