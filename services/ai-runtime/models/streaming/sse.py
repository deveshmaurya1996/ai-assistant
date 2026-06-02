
from __future__ import annotations

import json
from typing import Any


def format_sse(event: str, data: Any) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def sse_token(content: str) -> str:
    return format_sse("token", {"content": content})


def sse_done(model: str | None = None, label: str | None = None) -> str:
    data: dict[str, str] = {}
    if model:
        data["model"] = model
    if label:
        data["label"] = label
    return format_sse("done", data)


def sse_error(message: str) -> str:
    return format_sse("error", {"message": message})
