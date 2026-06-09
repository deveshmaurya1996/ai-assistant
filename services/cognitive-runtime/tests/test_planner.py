import pytest

from orchestration.planner import (
    _capability_allowed,
    _filter_caps_for_providers,
    _heuristic_connected_apps_query,
    _is_connected_apps_query,
    is_likely_tool_query,
    plan_tools,
)


def test_capability_allowed_requires_manifest_cap():
    caps = {"messaging.list_unread"}
    connected = {"whatsapp", "google"}
    assert _capability_allowed("messaging.list_unread", "whatsapp", caps, connected)
    assert not _capability_allowed("email.list_unread", "google", caps, connected)


def test_filter_caps_for_providers_respects_healthy_set():
    caps = {"messaging.list_unread", "email.list_unread", "resources.search"}
    healthy = {"whatsapp"}
    filtered = _filter_caps_for_providers(caps, healthy)
    assert "messaging.list_unread" in filtered
    assert "email.list_unread" not in filtered
    assert "resources.search" in filtered


def test_filter_caps_empty_when_no_healthy_providers():
    caps = {"messaging.list_unread"}
    assert _filter_caps_for_providers(caps, set()) == set()


@pytest.mark.parametrize(
    "query",
    [
        "what apps are connected",
        "what's connected",
        "which integrations do I have",
    ],
)
def test_is_connected_apps_query(query):
    assert _is_connected_apps_query(query)


def test_is_likely_tool_query_catch_up_phrases():
    assert is_likely_tool_query("catch me up on my inbox")
    assert is_likely_tool_query("anything new in my messages")
    assert is_likely_tool_query("what did I miss today")


def test_heuristic_connected_apps_query():
    assert _heuristic_connected_apps_query("what apps are connected")


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
