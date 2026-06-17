from knowledge.normalizer import normalize_tool_results


def test_normalize_whatsapp_search():
    items = normalize_tool_results(
        [
            {
                "tool": "whatsapp.search_messages",
                "result": {
                    "type": "messaging.search_result",
                    "items": [
                        {
                            "chatId": "1@s.whatsapp.net",
                            "sender": "Rahul",
                            "body": "Meeting moved to 3 PM",
                            "timestamp": "2026-06-16T10:00:00Z",
                            "messageId": "abc",
                        }
                    ],
                },
            }
        ]
    )
    assert len(items) == 1
    assert items[0].type == "message"
    assert items[0].source == "whatsapp"
    assert "Meeting" in items[0].content
