import pytest

from orchestration.attachment_intent import (
    attachment_turn_needs_tools,
    is_read_only_attachment_query,
    requires_integration_action,
    routing_intent_slice,
)


def test_routing_slice_prefers_first_paragraph():
    q = "summarize this\n\n" + ("email " * 100)
    assert "summarize" in routing_intent_slice(q)


def test_read_only_blocks_tool_routing():
    assert is_read_only_attachment_query("please summarize this pdf")
    assert not attachment_turn_needs_tools("summarize this\n\n" + "email " * 50)


def test_explicit_email_action_needs_tools():
    assert requires_integration_action("email this pdf to john@example.com")
    assert attachment_turn_needs_tools("email this pdf to john")
