from orchestration.intent_classifier import infer_turn_intent
from orchestration.turn_router import TurnIntent, classify_turn, is_direct_stream_route


def test_did_sarah_reply_needs_live_data():
    plan = infer_turn_intent("Did Sarah reply?")
    assert plan.needs_live_data
    assert "search_messages" in plan.abstract_capabilities


def test_meeting_with_rahul_tomorrow():
    plan = infer_turn_intent("What meeting do I have tomorrow with Rahul?")
    assert plan.needs_live_data
    assert "search_events" in plan.abstract_capabilities
    assert plan.entities.get("person") == "Rahul"


def test_am_i_free_tomorrow_routes_to_tool():
    route = classify_turn(
        query="Am I free tomorrow afternoon?",
        confirmed=False,
        skip_planning=False,
        rag_enabled=True,
        attachments=[],
        resolved_attachments=[],
        has_file_context=False,
    )
    assert route.intent == TurnIntent.TOOL
    assert route.run_planner
    assert not is_direct_stream_route(route)


def test_greeting_stays_casual():
    route = classify_turn(
        query="hi",
        confirmed=False,
        skip_planning=False,
        rag_enabled=True,
        attachments=[],
        resolved_attachments=[],
        has_file_context=False,
    )
    assert is_direct_stream_route(route)
