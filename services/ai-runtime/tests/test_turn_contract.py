from orchestration.speed_router import SpeedProfile
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
    turn = build_resolved_turn(
        route, retrieve_memory=False, speed_profile=SpeedProfile.FAST_RESPONSE
    )
    assert turn.task == "fast_chat"
    assert turn.allow_thinking is False
    assert turn.deadline_ms == 30_000
    assert turn.task_locked is True
    assert turn.speed_profile == "fast_response"


def test_reasoning_allows_thinking():
    route = _route(TurnIntent.KNOWLEDGE, "reasoning")
    turn = build_resolved_turn(
        route, retrieve_memory=True, speed_profile=SpeedProfile.DEEP_REASONING
    )
    assert turn.task == "reasoning"
    assert turn.allow_thinking is True
    assert turn.allow_rag is True
    assert turn.deadline_ms == 120_000


def test_voice_realtime_profile():
    route = _route(TurnIntent.CASUAL, "fast_chat")
    turn = build_resolved_turn(
        route, retrieve_memory=False, speed_profile=SpeedProfile.VOICE_REALTIME
    )
    assert turn.skip_planner is True
    assert turn.max_tokens == 200
    assert turn.memory_budget_ms == 100
    assert turn.deadline_ms == 15_000


def test_attachment_read_preserved_under_fast_response():
    route = _route(TurnIntent.KNOWLEDGE, "attachment_read")
    turn = build_resolved_turn(
        route, retrieve_memory=False, speed_profile=SpeedProfile.FAST_RESPONSE
    )
    assert turn.task == "attachment_read"
    assert turn.task_locked is True
