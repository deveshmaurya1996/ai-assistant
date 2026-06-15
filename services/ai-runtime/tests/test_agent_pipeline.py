from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from orchestration.agent_pipeline import iter_agent_turn_sse
from orchestration.turn_router import TurnIntent, classify_turn, is_direct_stream_route


class _Payload:
    query = "hi"
    routing_query = None
    user_id = "user-1"
    chat_history: list = []
    chat_session_id = "sess-1"
    source = "chat"
    rag_enabled = True
    confirmed = False
    tool_results = None
    skip_planning = False
    attachments: list = []
    resolved_attachments: list = []
    personality_id = None
    assistant_display_name = None
    system_prompt = None
    file_retrieval_context = ""
    session_context = ""
    timezone = None


@pytest.mark.asyncio
async def test_hi_direct_stream_skips_memory_retrieval():
    route = classify_turn(
        query="hi",
        confirmed=False,
        skip_planning=False,
        rag_enabled=True,
        attachments=[],
        resolved_attachments=[],
        has_file_context=False,
    )
    assert is_direct_stream_route(route)

    request = MagicMock()
    request.is_disconnected = AsyncMock(return_value=False)

    frames: list = []
    with patch(
        "orchestration.agent_pipeline.resolve_memory_retrieval",
        new_callable=AsyncMock,
    ) as mock_memory:
        with patch("orchestration.agent_pipeline.ai_http_client") as mock_client_ctx:
            mock_response = MagicMock()
            mock_response.status_code = 200

            async def _aiter_bytes():
                yield b"event: token\ndata: {\"content\":\"Hey\"}\n\n"

            mock_response.aiter_bytes = _aiter_bytes
            mock_response.aclose = AsyncMock()

            mock_stream_ctx = MagicMock()
            mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_response)
            mock_stream_ctx.__aexit__ = AsyncMock(return_value=None)

            mock_client = MagicMock()
            mock_client.stream = MagicMock(return_value=mock_stream_ctx)
            mock_client_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_ctx.return_value.__aexit__ = AsyncMock(return_value=None)

            async for frame in iter_agent_turn_sse(_Payload(), request):
                frames.append(frame)

    mock_memory.assert_not_called()
    assert any(b"token" in (f if isinstance(f, bytes) else f.encode()) for f in frames)


class _ImagePayload(_Payload):
    query = "draw me a cat wearing a hat"
    routing_query = "draw me a cat wearing a hat"


@pytest.mark.asyncio
async def test_image_generation_before_direct_stream():
    route = classify_turn(
        query="draw me a cat wearing a hat",
        confirmed=False,
        skip_planning=False,
        rag_enabled=True,
        attachments=[],
        resolved_attachments=[],
        has_file_context=False,
    )
    assert is_direct_stream_route(route)

    request = MagicMock()
    request.is_disconnected = AsyncMock(return_value=False)

    frames: list = []
    with patch("orchestration.agent_pipeline.ai_http_client") as mock_client_ctx:
        mock_post_response = MagicMock()
        mock_post_response.status_code = 200
        mock_post_response.json = MagicMock(
            return_value={
                "success": True,
                "caption": "Here is your cat.",
                "imageBase64": "abc123",
                "mimeType": "image/jpeg",
                "modelUsed": "flux",
            }
        )

        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_post_response)
        mock_client_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_ctx.return_value.__aexit__ = AsyncMock(return_value=None)

        async for frame in iter_agent_turn_sse(_ImagePayload(), request):
            frames.append(frame)

    mock_client.post.assert_awaited_once()
    assert mock_client.post.await_args.args[0].endswith("/v1/image/from-chat")
    assert any("__image_generating__" in (f if isinstance(f, str) else f.decode()) for f in frames)
