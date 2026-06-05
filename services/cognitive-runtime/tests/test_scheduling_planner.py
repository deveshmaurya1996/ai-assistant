from orchestration.scheduling_planner import (
    _humanize_automation_query,
    _looks_like_automation_query,
    _looks_like_scheduling_query,
    _is_timezone_followup,
    _normalize_action,
)


def test_looks_like_scheduling_query_reminder():
    assert _looks_like_scheduling_query("remind me at 9pm to call mom")


def test_looks_like_scheduling_query_automation():
    assert _looks_like_scheduling_query("check my inbox every morning at 8")


def test_looks_like_automation_query_digest():
    assert _looks_like_automation_query("check my inbox every 2 hours")


def test_looks_like_automation_query_not_simple_reminder():
    assert not _looks_like_automation_query("remind me at 9pm to call mom")


def test_timezone_followup_detected():
    history = [
        {"role": "user", "content": "remind me at 9pm to call mom"},
        {"role": "assistant", "content": "What timezone?"},
    ]
    assert _is_timezone_followup("ist", history)


def test_humanize_automation_query_tool_id():
    assert _humanize_automation_query("email.list_unread") == (
        "Check Gmail for important unread emails"
    )


def test_humanize_automation_query_unknown_tool_uses_user_prompt():
    assert _humanize_automation_query(
        "calendar.list_events",
        "check my calendar for meetings today",
    ) == "check my calendar for meetings today"


_HUMANIZE_PARITY = {
    "email.list_unread": "Check Gmail for important unread emails",
    "messaging.list_unread": "Check WhatsApp for important unread messages",
    "whatsapp.list_unread": "Check WhatsApp for important unread messages",
}


def test_humanize_automation_query_parity_with_types_package():
    for tool_id, expected in _HUMANIZE_PARITY.items():
        assert _humanize_automation_query(tool_id) == expected


def test_normalize_action_humanizes_automation_query():
    out = _normalize_action(
        {
            "tool": "automation.create",
            "args": {
                "cronExpression": "0 * * * *",
                "timezone": "Asia/Kolkata",
                "query": "messaging.list_unread",
            },
        },
        "Asia/Kolkata",
    )
    assert out is not None
    assert out["args"]["query"] == "Check WhatsApp for important unread messages"
