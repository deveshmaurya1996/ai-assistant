from orchestration.turn_contract import build_resolved_turn
from orchestration.turn_router import TurnIntent, TurnRoute


def _route(intent: TurnIntent, stream_task: str) -> TurnRoute:
    return TurnRoute(
        intent=intent,
        stream_task=stream_task,
        retrieve_memory=False,
        run_planner=False,
        run_tools=False,
        include_identity=False,
        history_limit=20,
    )


def test_casual_fast_chat_deadline_and_no_thinking():
    route = _route(TurnIntent.CASUAL, "fast_chat")
    turn = build_resolved_turn(route, retrieve_memory=False)
    assert turn.task == "fast_chat"
    assert turn.allow_thinking is False
    assert turn.deadline_ms == 30_000
    assert turn.task_locked is True


def test_reasoning_allows_thinking():
    route = _route(TurnIntent.KNOWLEDGE, "reasoning")
    turn = build_resolved_turn(route, retrieve_memory=True)
    assert turn.task == "reasoning"
    assert turn.allow_thinking is True
    assert turn.allow_rag is True
