import pytest

from orchestration.turn_router import TurnIntent, classify_turn


@pytest.mark.parametrize(
    "query,expected",
    [
        ("hi", TurnIntent.CASUAL),
        ("what is your name?", TurnIntent.CASUAL),
        ("what did we discuss about the project?", TurnIntent.MEMORY),
        ("do you remember my preference?", TurnIntent.MEMORY),
        ("check my email", TurnIntent.TOOL),
        ("send a whatsapp message", TurnIntent.TOOL),
        ("remind me at 3pm to call mom", TurnIntent.TOOL),
        ("set a reminder for tomorrow morning", TurnIntent.TOOL),
        (
            "I need you to set a reminder to not touch my nose every 1 min",
            TurnIntent.TOOL,
        ),
        ("check my inbox every morning at 8", TurnIntent.TOOL),
        ("call my father at 9 pm", TurnIntent.CASUAL),
        ("at 9 pm to call my father", TurnIntent.CASUAL),
    ],
)
def test_classify_turn_text_only(query, expected):
    route = classify_turn(
        query=query,
        confirmed=False,
        skip_planning=False,
        rag_enabled=True,
        attachments=[],
        resolved_attachments=[],
        has_file_context=False,
    )
    assert route.intent == expected


def test_classify_attachment_knowledge_skips_planner():
    route = classify_turn(
        query="summarize this document",
        confirmed=False,
        skip_planning=False,
        rag_enabled=True,
        attachments=[{"id": "f1"}],
        resolved_attachments=[
            {"textExcerpt": "chapter one content", "filename": "doc.pdf"}
        ],
        has_file_context=True,
    )
    assert route.intent == TurnIntent.KNOWLEDGE
    assert route.run_planner is False
    assert route.run_tools is False
    assert route.stream_task == "attachment_read"


def test_classify_attachment_knowledge_despite_email_in_long_body():
    long_body = "email " * 200 + "meeting calendar google inbox"
    route = classify_turn(
        query=f"summarize this document\n\n{long_body}",
        confirmed=False,
        skip_planning=False,
        rag_enabled=True,
        attachments=[{"id": "f1"}],
        resolved_attachments=[
            {"textExcerpt": "chapter one content", "filename": "doc.pdf"}
        ],
        has_file_context=True,
    )
    assert route.intent == TurnIntent.KNOWLEDGE
    assert route.run_planner is False


def test_classify_attachment_tool_runs_planner():
    route = classify_turn(
        query="email this pdf to john",
        confirmed=False,
        skip_planning=False,
        rag_enabled=True,
        attachments=[{"id": "f1"}],
        resolved_attachments=[{"textExcerpt": "content", "filename": "doc.pdf"}],
        has_file_context=True,
    )
    assert route.intent == TurnIntent.TOOL
    assert route.run_planner is True


def test_classify_confirm_intent():
    route = classify_turn(
        query="yes",
        confirmed=True,
        skip_planning=False,
        rag_enabled=True,
        attachments=[],
        resolved_attachments=[],
        has_file_context=False,
    )
    assert route.intent == TurnIntent.CONFIRM
    assert route.run_tools is True
