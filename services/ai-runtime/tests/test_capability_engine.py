from orchestration.capability_engine import resolve_tools


def test_resolve_search_messages():
    items = resolve_tools(
        ["search_messages"],
        {
            "messaging.search_messages",
            "email.search",
            "messaging.list_unread",
        },
        connection_states=[
            {"providerId": "whatsapp", "state": "ready"},
            {"providerId": "google", "state": "ready"},
        ],
        entities={"person": "Rahul"},
    )
    cap_ids = [i["capability"] for i in items]
    assert "messaging.search_messages" in cap_ids
    assert any(i.get("args", {}).get("query") == "Rahul" for i in items)
