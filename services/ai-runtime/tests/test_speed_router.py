from orchestration.speed_router import SpeedProfile, resolve_speed_profile
from orchestration.turn_router import TurnIntent, TurnRoute


def _route(intent: TurnIntent, stream_task: str = "fast_chat") -> TurnRoute:
    return TurnRoute(
        intent=intent,
        stream_task=stream_task,
        retrieve_memory=False,
        run_planner=False,
        run_tools=False,
        include_identity=False,
        history_limit=20,
    )


def test_voice_source_uses_voice_realtime():
    profile = resolve_speed_profile(route=_route(TurnIntent.CASUAL), source="voice")
    assert profile == SpeedProfile.VOICE_REALTIME


def test_casual_chat_uses_fast_response():
    profile = resolve_speed_profile(route=_route(TurnIntent.CASUAL), source="chat")
    assert profile == SpeedProfile.FAST_RESPONSE


def test_reasoning_task_uses_deep_reasoning():
    profile = resolve_speed_profile(
        route=_route(TurnIntent.KNOWLEDGE, "reasoning"), source="chat"
    )
    assert profile == SpeedProfile.DEEP_REASONING


def test_tool_intent_uses_balanced():
    profile = resolve_speed_profile(route=_route(TurnIntent.TOOL, "auto"), source="chat")
    assert profile == SpeedProfile.BALANCED
