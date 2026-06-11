from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

from httpx import AsyncClient
from starlette.requests import Request

from cognitive_env_loader import resolve_ai_service_url

_embedded_parent_app = None
AI_SERVICE_URL = resolve_ai_service_url()


def set_embedded_parent_app(app) -> None:
    global _embedded_parent_app
    _embedded_parent_app = app


def _direct_ai_handlers_available() -> bool:
    try:
        import api.chat
        return True
    except ImportError:
        return False


def embedded_mode() -> bool:
    if _direct_ai_handlers_available():
        return True
    if _embedded_parent_app is None:
        return False
    return os.getenv("COGNITIVE_EMBEDDED", "").strip().lower() in ("1", "true", "yes")


def ai_request_url(path: str) -> str:
    normalized = path if path.startswith("/") else f"/{path}"
    if embedded_mode():
        return normalized
    base = AI_SERVICE_URL.rstrip("/")
    return f"{base}{normalized}"


async def _embedded_receive():
    return {"type": "http.request", "body": b"", "more_body": False}


def _embedded_request() -> Request:
    return Request(
        {
            "type": "http",
            "asgi": {"spec_version": "2.3", "version": "3.0"},
            "method": "POST",
            "path": "/",
            "headers": [],
            "query_string": b"",
        },
        _embedded_receive,
    )


class _EmbeddedStreamCtx:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    @property
    def status_code(self) -> int:
        return self._response.status_code

    async def aread(self) -> bytes:
        chunks: list[bytes] = []
        async for part in self._response.body_iterator:
            chunks.append(part if isinstance(part, bytes) else str(part).encode())
        return b"".join(chunks)

    def aiter_bytes(self) -> AsyncIterator[bytes]:
        return self._response.body_iterator


class EmbeddedAiClient:
    def __init__(self, timeout: Optional[float] = None):
        self.timeout = timeout

    async def post(self, url: str, json: Optional[dict] = None, **_: Any):
        path = ai_request_url(url)
        body = json or {}

        if path == "/v1/chat/complete":
            from api.chat import ChatCompleteRequest, chat_complete

            payload = ChatCompleteRequest.model_validate(body)
            data = await chat_complete(payload)
            encoded = json.dumps(data).encode()
            return _PostResponse(200, encoded)

        if path == "/v1/image/from-chat":
            from fastapi.responses import JSONResponse

            from api.image_chat import ImageFromChatRequest, image_from_chat

            payload = ImageFromChatRequest.model_validate(body)
            data = image_from_chat(payload)
            if isinstance(data, JSONResponse):
                return _PostResponse(data.status_code, data.body)
            return _PostResponse(200, json.dumps(data).encode())

        if path == "/v1/memory/should-retrieve":
            from api.router import memory_should_retrieve
            from api.router import ShouldRetrieveRequest

            payload = ShouldRetrieveRequest.model_validate(body)
            data = await memory_should_retrieve(payload)
            return _PostResponse(200, json.dumps(data).encode())

        raise RuntimeError(f"Unsupported embedded AI POST path: {path}")

    async def get(self, url: str, params: Optional[dict] = None, **_: Any):
        path = ai_request_url(url)
        if path.startswith("/v1/memory/search"):
            from api.router import memory_search

            data = await memory_search(
                query=(params or {}).get("query", ""),
                user_id=(params or {}).get("user_id", ""),
                limit=int((params or {}).get("limit", 5)),
                session_id=(params or {}).get("session_id"),
            )
            return _PostResponse(200, json.dumps(data).encode())
        raise RuntimeError(f"Unsupported embedded AI GET path: {path}")

    def stream(self, method: str, url: str, json: Optional[dict] = None, **_: Any):
        path = ai_request_url(url)
        body = json or {}

        async def _open() -> _EmbeddedStreamCtx:
            if path != "/v1/chat/stream":
                raise RuntimeError(f"Unsupported embedded AI stream path: {path}")
            from api.chat import ChatStreamRequest, chat_stream

            payload = ChatStreamRequest.model_validate(body)
            response = await chat_stream(payload, _embedded_request())
            return _EmbeddedStreamCtx(response)

        return _StreamGen(_open)


class _PostResponse:
    def __init__(self, status_code: int, body: bytes):
        self.status_code = status_code
        self._body = body

    def json(self) -> Any:
        return json.loads(self._body.decode())


class _StreamGen:
    def __init__(self, opener):
        self._opener = opener
        self._ctx: Optional[_EmbeddedStreamCtx] = None

    async def __aenter__(self) -> _EmbeddedStreamCtx:
        self._ctx = await self._opener()
        return self._ctx

    async def __aexit__(self, *_args):
        self._ctx = None


@asynccontextmanager
async def ai_http_client(timeout: Optional[float] = None) -> AsyncIterator[Any]:
    if embedded_mode():
        yield EmbeddedAiClient(timeout=timeout)
    else:
        async with AsyncClient(timeout=timeout) as client:
            yield client
