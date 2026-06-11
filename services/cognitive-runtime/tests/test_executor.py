import pytest

from orchestration.executor import _resolve_connection_id, execute_planned_tools


def test_resolve_connection_id_maps_email_tools_to_google():
    connections = [{"id": "google_user-1", "providerId": "google"}]
    assert _resolve_connection_id("email.read_email", connections) == "google_user-1"
    assert _resolve_connection_id("email.list_unread", connections) == "google_user-1"
    assert _resolve_connection_id("gmail.search", connections) == "google_user-1"
    assert _resolve_connection_id("calendar.list_upcoming", connections) == "google_user-1"
    assert _resolve_connection_id("drive.search", connections) == "google_user-1"


def test_resolve_connection_id_maps_whatsapp_tools():
    connections = [{"id": "whatsapp_user-1", "providerId": "whatsapp"}]
    assert _resolve_connection_id("whatsapp.list_unread", connections) == "whatsapp_user-1"


@pytest.mark.asyncio
async def test_read_chat_fails_when_search_finds_no_contact(monkeypatch):
    async def mock_whatsapp_execute(client, user_id, tool_name, args, source, confirmed, connection_id, chat_session_id):
        if tool_name == "whatsapp.search_chats":
            return {
                "tool": tool_name,
                "status": "completed",
                "result": {"chats": []},
            }
        raise AssertionError(f"read_chat should not be called, got {tool_name}")

    monkeypatch.setattr(
        "orchestration.executor._execute_whatsapp_via_gateway",
        mock_whatsapp_execute,
    )

    tools = [
        {
            "tool": "whatsapp.search_chats",
            "args": {"query": "Dad"},
            "capability": "messaging.search_chats",
            "provider": "whatsapp",
        },
        {
            "tool": "whatsapp.read_chat",
            "args": {"chatId": "Dad", "limit": 25},
            "capability": "messaging.read_chat",
            "provider": "whatsapp",
        },
    ]
    connections = [{"id": "whatsapp_user-1", "providerId": "whatsapp"}]
    results = await execute_planned_tools(
        tools, "user-1", "chat", True, connections=connections
    )
    read_result = next(r for r in results if r.get("tool") == "whatsapp.read_chat")
    assert read_result.get("status") == "failed"
    assert "Could not find WhatsApp chat" in str(read_result.get("error"))
