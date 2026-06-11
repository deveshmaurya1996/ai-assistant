import pytest

from orchestration.pipeline import PlanInput, run_planner_pipeline
from orchestration.types import PlanTrace


@pytest.mark.asyncio
async def test_pipeline_trace_on_heuristic():
    trace = PlanTrace()
    inp = PlanInput(
        query="check my gmail unread",
        context="ctx",
        user_id="u1",
        manifest_caps={"email.list_unread"},
        manifest_connections=[{"id": "g1", "providerId": "google"}],
        manifest_connection_states=[{"providerId": "google", "state": "ready"}],
        trace=trace,
    )
    result = await run_planner_pipeline(inp)
    assert result["planner"] == "heuristic"
    assert "trace" in result
    stage_names = [s["name"] for s in result["trace"]["stages"]]
    assert "heuristic" in stage_names


@pytest.mark.asyncio
async def test_pipeline_connected_apps_early_exit():
    inp = PlanInput(
        query="what apps are connected",
        context="ctx",
        user_id="u1",
        manifest_caps=set(),
        manifest_connections=[],
        trace=PlanTrace(),
    )
    result = await run_planner_pipeline(inp)
    assert result["planner"] == "connected-apps-info"
    stage_names = [s["name"] for s in result["trace"]["stages"]]
    assert "integration_gate" in stage_names
