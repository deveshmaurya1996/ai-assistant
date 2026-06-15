from orchestration.llm.json_parse import parse_llm_json
from workflows.automation import _extract_actions, _normalize_action


def test_scheduling_extract_and_normalize_reminder():
    raw = (
        '{"actions":[{"tool":"reminder.create","args":{'
        '"userPrompt":"call mom at 9pm","timezone":"Asia/Kolkata"}}]}'
    )
    parsed = parse_llm_json(raw)
    actions = _extract_actions(parsed)
    assert len(actions) == 1
    normalized = _normalize_action(actions[0], "Asia/Kolkata")
    assert normalized is not None
    assert normalized["tool"] == "reminder.create"
    assert normalized["args"]["timezone"] == "Asia/Kolkata"


def test_scheduling_parse_clarification():
    raw = '{"clarification":"What timezone should I use?","schedulingIntent":true}'
    parsed = parse_llm_json(raw)
    assert parsed.get("clarification") == "What timezone should I use?"
    assert parsed.get("schedulingIntent") is True
