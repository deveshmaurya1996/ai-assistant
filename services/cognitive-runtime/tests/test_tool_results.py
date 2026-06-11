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


def test_whatsapp_read_chat_summary():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "whatsapp.read_chat",
                "status": "completed",
                "result": {
                    "type": "messaging.conversation",
                    "chatId": "919876543210@s.whatsapp.net",
                    "displayName": "Rahul",
                    "messages": [
                        {
                            "sender": "Rahul",
                            "body": "Are we still on for lunch?",
                            "fromMe": False,
                        }
                    ],
                },
            }
        ]
    )
    assert "WhatsApp messages (Rahul" in ctx
    assert "Are we still on for lunch?" in ctx


def test_whatsapp_search_chats_skipped_when_read_chat_present():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "whatsapp.search_chats",
                "status": "completed",
                "result": {"chats": [{"jid": "919876543210@s.whatsapp.net", "name": "Dad"}]},
            },
            {
                "tool": "whatsapp.read_chat",
                "status": "completed",
                "result": {
                    "type": "messaging.conversation",
                    "chatId": "919876543210@s.whatsapp.net",
                    "displayName": "Dad",
                    "messages": [{"sender": "Dad", "body": "Hey, are you coming home?"}],
                },
            },
        ]
    )
    assert "completed successfully" not in ctx
    assert "Hey, are you coming home?" in ctx
    assert "Dad" in ctx


def test_whatsapp_read_chat_empty_uses_display_name():
    ctx = format_tool_results_for_context(
        [
            {
                "tool": "whatsapp.read_chat",
                "status": "completed",
                "result": {
                    "type": "messaging.conversation",
                    "chatId": "919876543210@s.whatsapp.net",
                    "displayName": "Dad",
                    "messages": [],
                },
            }
        ]
    )
    assert "WhatsApp (Dad): chat found but no messages synced yet" in ctx


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
