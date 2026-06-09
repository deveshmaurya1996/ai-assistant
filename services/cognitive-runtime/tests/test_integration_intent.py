from orchestration.integration_intent import (
    is_read_intent,
    is_send_intent,
    resolve_integration_intent,
)


def test_is_read_intent_detects_unread_queries():
    assert is_read_intent("check my whatsapp unread messages")
    assert not is_send_intent("check my whatsapp unread messages")


def test_is_send_intent_detects_explicit_send():
    assert is_send_intent("send message to John: hello")
    assert not is_read_intent("send message to John: hello")


def test_resolve_unsupported_slack():
    intent = resolve_integration_intent("check my slack inbox", [])
    assert intent.action == "unsupported_prompt"
    assert "Slack" in intent.user_guidance


def test_resolve_connect_prompt_when_not_connected():
    intent = resolve_integration_intent(
        "check my gmail",
        [{"providerId": "google", "state": "not_connected"}],
    )
    assert intent.action == "connect_prompt"
    assert "Connect Apps" in intent.user_guidance


def test_resolve_offline_prompt():
    intent = resolve_integration_intent(
        "check whatsapp unread",
        [{"providerId": "whatsapp", "state": "offline"}],
    )
    assert intent.action == "offline_prompt"
    assert "offline" in intent.user_guidance.lower()


def test_resolve_execute_when_ready():
    intent = resolve_integration_intent(
        "check whatsapp unread",
        [{"providerId": "whatsapp", "state": "ready"}],
    )
    assert intent.action == "execute"
    assert intent.providers == ["whatsapp"]
