
from __future__ import annotations

import json
from typing import Any


def format_sse(event: str, data: Any) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def sse_token(content: str) -> str:
    return format_sse("token", {"content": content})


def sse_done(
    model: str | None = None,
    label: str | None = None,
    *,
    meta: dict[str, Any] | None = None,
) -> str:
    data: dict[str, Any] = {}
    if model:
        data["model"] = model
    if label:
        data["label"] = label
    if meta:
        data["meta"] = meta
    return format_sse("done", data)


def sse_error(message: str) -> str:
    return format_sse("error", {"message": message})


def sse_provider_switch(
    from_provider: str,
    to_provider: str,
    from_model: str,
    to_model: str,
) -> str:
    return format_sse(
        "provider_switch",
        {
            "from_provider": from_provider,
            "to_provider": to_provider,
            "from_model": from_model,
            "to_model": to_model,
            "message": f"Switching provider ({from_provider} → {to_provider})…",
        },
    )
