from orchestration.tool_results import format_tool_results_for_context


def test_reminder_create_formats_friendly_summary():
    text = format_tool_results_for_context(
        [
            {
                "tool": "reminder.create",
                "executionId": "exec_123",
                "status": "completed",
                "result": {
                    "type": "reminder.created",
                    "reminder": {
                        "payload": {"title": "Call your father"},
                        "nextFireAt": "2026-06-05T21:00:00.000Z",
                    },
                },
            }
        ]
    )
    assert "Call your father" in text
    assert "Reminder scheduled" in text
    assert "exec_123" not in text
    assert "executionId" not in text
    assert "Never mention tool names" in text


def test_reminder_create_includes_schedule_label():
    text = format_tool_results_for_context(
        [
            {
                "tool": "reminder.create",
                "status": "completed",
                "result": {
                    "type": "reminder.created",
                    "reminder": {
                        "payload": {"title": "Drink water"},
                        "scheduleLabel": "Every hour",
                        "scheduled": True,
                    },
                },
            }
        ]
    )
    assert "Drink water" in text
    assert "Every hour" in text


def test_reminder_create_reports_delayed_scheduling():
    text = format_tool_results_for_context(
        [
            {
                "tool": "reminder.create",
                "status": "completed",
                "result": {
                    "type": "reminder.created",
                    "reminder": {
                        "payload": {"title": "Call your father"},
                        "nextFireAt": "2026-06-05T21:00:00.000Z",
                        "scheduled": False,
                        "scheduleWarning": "Scheduler unavailable",
                    },
                },
            }
        ]
    )
    assert "Reminder saved" in text
    assert "delayed" in text
    assert "Scheduler unavailable" in text


def test_skips_confirmation_entries():
    text = format_tool_results_for_context(
        [{"tool": "whatsapp.send_message", "requiresConfirmation": True}]
    )
    assert text == ""
