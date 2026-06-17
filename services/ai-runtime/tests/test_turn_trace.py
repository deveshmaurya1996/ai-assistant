from orchestration.turn_trace import (
    compute_grounded,
    count_rows_in_tool_results,
    finalize_trace,
    TurnTrace,
)


def test_count_rows_in_search_result():
    results = [
        {
            "tool": "whatsapp.search_messages",
            "status": "completed",
            "result": {
                "data": {
                    "type": "messaging.search_result",
                    "items": [{"body": "hi"}, {"body": "there"}],
                }
            },
        }
    ]
    assert count_rows_in_tool_results(results) == 2


def test_grounding_blocked_without_data():
    grounded, gate = compute_grounded(
        needs_live_data=True,
        rows_retrieved=0,
        planner="capability-llm",
        tool_context="",
        route_direct_stream=False,
    )
    assert not grounded
    assert gate == "blocked_no_data"


def test_grounding_passed_with_rows():
    trace = TurnTrace(needs_live_data=True, query="test")
    finalize_trace(
        trace,
        tool_results=[
            {
                "tool": "email.list_unread",
                "result": {"emails": [{"subject": "Hi"}]},
            }
        ],
        planner="heuristic",
        tool_context="- Gmail: 1 unread",
        route_direct_stream=False,
        turn_t0=0,
    )
    assert trace.grounded
    assert trace.rows_retrieved >= 1
