from orchestration.tool_results import extract_integration_actions_from_tool_results


def test_extract_integration_actions_not_connected():
    actions = extract_integration_actions_from_tool_results(
        [
            {
                "tool": "whatsapp.list_unread",
                "error": "[NOT_CONNECTED] WhatsApp is not connected.",
            }
        ]
    )
    assert len(actions) == 1
    assert actions[0]["providerId"] == "whatsapp"
    assert actions[0]["action"] == "connect"


def test_extract_integration_actions_offline():
    actions = extract_integration_actions_from_tool_results(
        [
            {
                "tool": "whatsapp.read_chat",
                "error": "[OFFLINE] WhatsApp session is offline.",
            }
        ]
    )
    assert len(actions) == 1
    assert actions[0]["action"] == "reconnect"
