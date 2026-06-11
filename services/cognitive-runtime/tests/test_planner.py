import pytest

from orchestration.capability_llm import _capability_allowed
from orchestration.heuristics.connected_apps import heuristic_connected_apps_query
from orchestration.integration_intent import is_connected_apps_query
from orchestration.plan_helpers import filter_caps_for_providers
from orchestration.planner import is_likely_tool_query, plan_tools


def test_capability_allowed_requires_manifest_cap():
    caps = {"messaging.list_unread"}
    assert _capability_allowed("messaging.list_unread", caps)
    assert not _capability_allowed("email.list_unread", caps)


def test_filter_caps_for_providers_respects_healthy_set():
    caps = {"messaging.list_unread", "email.list_unread", "resources.search"}
    healthy = {"whatsapp"}
    filtered = filter_caps_for_providers(caps, healthy)
    assert "messaging.list_unread" in filtered
    assert "email.list_unread" not in filtered
    assert "resources.search" in filtered


def test_filter_caps_empty_when_no_healthy_providers():
    caps = {"messaging.list_unread"}
    assert filter_caps_for_providers(caps, set()) == set()


@pytest.mark.parametrize(
    "query",
    [
        "what apps are connected",
        "what's connected",
        "which integrations do I have",
    ],
)
def test_is_connected_apps_query(query):
    assert is_connected_apps_query(query)


def test_is_likely_tool_query_catch_up_phrases():
    assert is_likely_tool_query("catch me up on my inbox")
    assert is_likely_tool_query("anything new in my messages")
    assert is_likely_tool_query("what did I miss today")


def test_heuristic_connected_apps_query():
    assert heuristic_connected_apps_query("what apps are connected")


@pytest.mark.asyncio
async def test_plan_tools_connected_apps_returns_no_tools():
    result = await plan_tools(
        "what apps are connected",
        "Connected apps (ACTIVE): google, whatsapp.",
        "user-1",
        manifest_caps={"email.list_unread", "messaging.list_unread"},
        manifest_connections=[
            {"id": "google_user-1", "providerId": "google"},
            {"id": "whatsapp_user-1", "providerId": "whatsapp"},
        ],
    )
    assert result["planner"] == "connected-apps-info"
    assert result["tools"] == []
    assert result["capabilities"] == []
    assert "trace" in result


@pytest.mark.asyncio
async def test_plan_tools_whatsapp_unread_does_not_plan_send():
    result = await plan_tools(
        "check my whatsapp unread messages",
        "Ready for AI: whatsapp.",
        "user-1",
        manifest_caps={
            "messaging.list_unread",
            "messaging.send_message",
            "messaging.search_chats",
        },
        manifest_connections=[{"id": "whatsapp_user-1", "providerId": "whatsapp"}],
        manifest_connection_states=[{"providerId": "whatsapp", "state": "ready"}],
    )
    tool_names = [t.get("tool") for t in result["tools"]]
    assert "whatsapp.list_unread" in tool_names
    assert "whatsapp.send_message" not in tool_names


@pytest.mark.asyncio
async def test_plan_tools_send_message_plans_search_and_send():
    result = await plan_tools(
        "send message to John: hello there",
        "Ready for AI: whatsapp.",
        "user-1",
        manifest_caps={
            "messaging.list_unread",
            "messaging.send_message",
            "messaging.search_chats",
        },
        manifest_connections=[{"id": "whatsapp_user-1", "providerId": "whatsapp"}],
        manifest_connection_states=[{"providerId": "whatsapp", "state": "ready"}],
    )
    tool_names = [t.get("tool") for t in result["tools"]]
    assert "whatsapp.search_chats" in tool_names
    assert "whatsapp.send_message" in tool_names


@pytest.mark.asyncio
async def test_plan_tools_unsupported_app_blocks_tools():
    result = await plan_tools(
        "check my slack messages",
        "Ready for AI: none.",
        "user-1",
        manifest_caps=set(),
        manifest_connections=[],
        manifest_connection_states=[],
    )
    assert result["planner"] == "integration-unsupported"
    assert result["tools"] == []
    assert "Slack" in result.get("user_guidance", "")


@pytest.mark.asyncio
async def test_plan_tools_disconnected_gmail_blocks_tools():
    result = await plan_tools(
        "check my gmail",
        "Not connected: google.",
        "user-1",
        manifest_caps=set(),
        manifest_connections=[],
        manifest_connection_states=[{"providerId": "google", "state": "not_connected"}],
    )
    assert result["planner"] == "integration-blocked"
    assert result["tools"] == []
    assert "Connect Apps" in result.get("user_guidance", "")


@pytest.mark.asyncio
async def test_plan_tools_read_personal_whatsapp_messages():
    result = await plan_tools(
        "read whatsapp messages from Rahul",
        "Ready for AI: whatsapp.",
        "user-1",
        manifest_caps={"messaging.search_chats", "messaging.read_chat"},
        manifest_connections=[{"id": "whatsapp_user-1", "providerId": "whatsapp"}],
        manifest_connection_states=[{"providerId": "whatsapp", "state": "ready"}],
    )
    assert result["planner"] == "heuristic"
    tool_names = [t.get("tool") for t in result["tools"]]
    assert "whatsapp.search_chats" in tool_names
    assert "whatsapp.read_chat" in tool_names
    assert "whatsapp.list_unread" not in tool_names


@pytest.mark.asyncio
async def test_plan_tools_check_msg_from_dad():
    result = await plan_tools(
        "check msg from Dad",
        "Ready for AI: whatsapp.",
        "user-1",
        manifest_caps={"messaging.search_chats", "messaging.read_chat", "messaging.list_unread"},
        manifest_connections=[{"id": "whatsapp_user-1", "providerId": "whatsapp"}],
        manifest_connection_states=[{"providerId": "whatsapp", "state": "ready"}],
    )
    assert result["planner"] == "heuristic"
    tool_names = [t.get("tool") for t in result["tools"]]
    assert "whatsapp.search_chats" in tool_names
    assert "whatsapp.read_chat" in tool_names
    assert "whatsapp.list_unread" not in tool_names
    read_tool = next(t for t in result["tools"] if t.get("tool") == "whatsapp.read_chat")
    assert read_tool["args"]["chatId"] == "Dad"


@pytest.mark.asyncio
async def test_plan_tools_list_all_unread_msg_uses_higher_limit():
    result = await plan_tools(
        "list all unread msg",
        "Ready for AI: whatsapp.",
        "user-1",
        manifest_caps={"messaging.list_unread"},
        manifest_connections=[{"id": "whatsapp_user-1", "providerId": "whatsapp"}],
        manifest_connection_states=[{"providerId": "whatsapp", "state": "ready"}],
    )
    assert result["planner"] == "heuristic"
    wa = next(t for t in result["tools"] if t.get("tool") == "whatsapp.list_unread")
    assert wa["args"]["limit"] == 50


@pytest.mark.asyncio
async def test_plan_tools_yesterday_calendar_includes_time_range():
    result = await plan_tools(
        "what meetings did I have yesterday",
        "Ready for AI: google.",
        "user-1",
        timezone="Asia/Kolkata",
        manifest_caps={"calendar.list_upcoming"},
        manifest_connections=[{"id": "google_user-1", "providerId": "google"}],
        manifest_connection_states=[{"providerId": "google", "state": "ready"}],
    )
    assert result["planner"] == "heuristic"
    cal = next(t for t in result["tools"] if t.get("tool") == "calendar.list_upcoming")
    assert cal["args"].get("timeMin")
    assert cal["args"].get("timeMax")
    assert cal["args"].get("rangeLabel") == "yesterday"


@pytest.mark.asyncio
async def test_plan_tools_gmail_unread_uses_heuristic_not_scheduling():
    result = await plan_tools(
        "check my gmail unread",
        "Ready for AI: google.",
        "user-1",
        manifest_caps={"email.list_unread", "email.search"},
        manifest_connections=[{"id": "google_user-1", "providerId": "google"}],
        manifest_connection_states=[{"providerId": "google", "state": "ready"}],
    )
    assert result["planner"] == "heuristic"
    tool_names = [t.get("tool") for t in result["tools"]]
    assert "email.list_unread" in tool_names


@pytest.mark.asyncio
async def test_plan_tools_inbox_plans_email_and_whatsapp_when_connected():
    result = await plan_tools(
        "check my inbox",
        "Ready for AI: google, whatsapp.",
        "user-1",
        manifest_caps={"email.list_unread", "messaging.list_unread"},
        manifest_connections=[
            {"id": "google_user-1", "providerId": "google"},
            {"id": "whatsapp_user-1", "providerId": "whatsapp"},
        ],
        manifest_connection_states=[
            {"providerId": "google", "state": "ready"},
            {"providerId": "whatsapp", "state": "ready"},
        ],
    )
    assert result["planner"] == "heuristic"
    tool_names = [t.get("tool") for t in result["tools"]]
    assert "whatsapp.list_unread" in tool_names
    assert "email.list_unread" in tool_names


@pytest.mark.asyncio
async def test_plan_tools_calendar_cancel_lists_before_cancel():
    result = await plan_tools(
        "cancel my meeting with Sarah tomorrow",
        "Ready for AI: google.",
        "user-1",
        manifest_caps={"calendar.list_upcoming", "calendar.cancel_event"},
        manifest_connections=[{"id": "google_user-1", "providerId": "google"}],
        manifest_connection_states=[{"providerId": "google", "state": "ready"}],
    )
    assert result["planner"] == "heuristic"
    tool_names = [t.get("tool") for t in result["tools"]]
    assert "calendar.list_upcoming" in tool_names
    assert "calendar.cancel_event" in tool_names


@pytest.mark.asyncio
async def test_plan_tools_drive_read_plans_search_and_content():
    result = await plan_tools(
        "summarize my budget spreadsheet in google drive",
        "Ready for AI: google.",
        "user-1",
        manifest_caps={"drive.search", "drive.get_content"},
        manifest_connections=[{"id": "google_user-1", "providerId": "google"}],
        manifest_connection_states=[{"providerId": "google", "state": "ready"}],
    )
    assert result["planner"] == "heuristic"
    tool_names = [t.get("tool") for t in result["tools"]]
    assert "drive.search" in tool_names
    assert "drive.get_content" in tool_names


@pytest.mark.asyncio
async def test_plan_tools_check_whatsapp_plans_list_unread():
    result = await plan_tools(
        "check my whatsapp",
        "Ready for AI: whatsapp.",
        "user-1",
        manifest_caps={"messaging.list_unread"},
        manifest_connections=[{"id": "whatsapp_user-1", "providerId": "whatsapp"}],
        manifest_connection_states=[{"providerId": "whatsapp", "state": "ready"}],
    )
    assert result["planner"] == "heuristic"
    tool_names = [t.get("tool") for t in result["tools"]]
    assert "whatsapp.list_unread" in tool_names
