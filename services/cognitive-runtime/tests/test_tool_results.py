from orchestration.tool_results import format_tool_results_for_context


def test_reminder_create_success_summary():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "reminder.create",
                "status": "completed",
                "result": {
                    "reminder": {
                        "scheduled": True,
                        "payload": {"title": "Call mom"},
                        "nextFireAt": "2026-06-05T21:00:00+05:30",
                    }
                },
            }
        ]
    )
    assert "Reminder scheduled:" in ctx
    assert "Call mom" in ctx


def test_automation_create_success_summary():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "automation.create",
                "status": "completed",
                "result": {
                    "automation": {
                        "name": "Inbox digest",
                        "schedule": "0 */2 * * *",
                    }
                },
            }
        ]
    )
    assert "Inbox digest automation created" in ctx


def test_automation_update_success_summary():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "automation.update",
                "status": "completed",
                "result": {
                    "automation": {"name": "Inbox digest", "isActive": False},
                },
            }
        ]
    )
    assert "Automation updated:" in ctx


def test_automation_cancel_success_summary():
    ctx = format_tool_results_for_context(
        [{"tool": "automation.cancel", "status": "completed", "result": {}}]
    )
    assert "Automation cancelled" in ctx
