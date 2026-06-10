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


def test_email_read_message_summary():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "email.read_email",
                "status": "completed",
                "result": {
                    "data": {
                        "type": "email.message",
                        "from": "Ashwini <a@example.com>",
                        "subject": "Project update",
                        "body": "Here is the latest status.",
                        "timestamp": "2026-06-10T10:00:00.000Z",
                    }
                },
            }
        ]
    )
    assert "Latest Gmail" in ctx
    assert "Project update" in ctx
    assert "Ashwini" in ctx


def test_calendar_list_summary():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "calendar.list_upcoming",
                "status": "completed",
                "result": {
                    "type": "calendar.event_list",
                    "events": [
                        {
                            "title": "Team standup",
                            "start": "2026-06-11T09:00:00Z",
                            "end": "2026-06-11T09:30:00Z",
                        }
                    ],
                },
            }
        ]
    )
    assert "Calendar upcoming" in ctx
    assert "Team standup" in ctx


def test_calendar_yesterday_empty_summary():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "calendar.list_upcoming",
                "status": "completed",
                "result": {
                    "type": "calendar.event_list",
                    "rangeLabel": "yesterday",
                    "events": [],
                },
            }
        ]
    )
    assert "Calendar (yesterday): no events found." in ctx


def test_drive_search_summary():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "drive.search",
                "status": "completed",
                "result": {
                    "type": "drive.search_result",
                    "query": "budget",
                    "items": [{"name": "Q1 Budget.xlsx", "mimeType": "application/vnd.ms-excel"}],
                },
            }
        ]
    )
    assert "Google Drive files" in ctx
    assert "Q1 Budget.xlsx" in ctx


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
