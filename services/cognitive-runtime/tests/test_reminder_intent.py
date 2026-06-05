import pytest

from orchestration.reminder_intent import is_timed_remind_intent


@pytest.mark.parametrize(
    "query,expected",
    [
        ("remind me to call my father at 9 pm", True),
        ("set a reminder to call father at 9pm", True),
        ("I need you to set a reminder to not touch my nose every 1 min", True),
        ("call my father at 9 pm", True),
        ("at 9 pm to call my father", True),
        ("hey can you set a reminder to drink water every 1 hour", True),
        ("set a reminder to drink water", True),
        ("can you set a reminder to drink water every 1 hour", True),
        ("set reminder to drink water every hour", True),
        ("what is the weather", False),
        ("schedule a meeting with John tomorrow", False),
        ("hi there", False),
    ],
)
def test_is_timed_remind_intent(query, expected):
    assert is_timed_remind_intent(query) is expected
