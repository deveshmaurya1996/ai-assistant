from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from orchestration.reminder_client import execute_reminder_via_gateway


def _mock_response(status_code: int, json_data=None, text: str = ""):
    res = MagicMock()
    res.status_code = status_code
    if json_data is not None:
        res.json = MagicMock(return_value=json_data)
    else:
        res.json = MagicMock(side_effect=ValueError("no json"))
    res.text = text
    return res


@pytest.mark.asyncio
async def test_reminder_client_create_success():
    client = AsyncMock()
    client.post = AsyncMock(
        return_value=_mock_response(
            201,
            {
                "id": "rem-1",
                "payload": {"title": "Call father"},
                "nextFireAt": "2026-06-05T21:00:00.000Z",
                "scheduled": True,
            },
        )
    )

    result = await execute_reminder_via_gateway(
        client,
        "user-1",
        "reminder.create",
        {"userPrompt": "remind me at 9pm to call father", "timezone": "UTC"},
    )

    assert result["status"] == "completed"
    assert result["result"]["reminder"]["id"] == "rem-1"
    client.post.assert_awaited_once()
    body = client.post.await_args.kwargs["json"]
    assert body["userPrompt"] == "remind me at 9pm to call father"
    assert body["title"] == "remind me at 9pm to call father"


@pytest.mark.asyncio
async def test_reminder_client_create_requires_timezone():
    client = AsyncMock()

    result = await execute_reminder_via_gateway(
        client,
        "user-1",
        "reminder.create",
        {"userPrompt": "set a reminder to drink water every 1 hour"},
    )

    assert result["status"] == "failed"
    assert "timezone" in str(result.get("error", "")).lower()
    client.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_reminder_client_create_403():
    client = AsyncMock()
    client.post = AsyncMock(
        return_value=_mock_response(403, {"error": "Forbidden"})
    )

    with patch(
        "orchestration.reminder_client.GATEWAY_URL",
        "http://localhost:3000",
    ):
        result = await execute_reminder_via_gateway(
            client,
            "user-1",
            "reminder.create",
            {"userPrompt": "remind me at 9pm", "timezone": "UTC"},
        )

    assert result["status"] == "failed"
    assert result["error"] == "Forbidden"
