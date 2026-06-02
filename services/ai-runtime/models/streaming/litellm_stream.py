
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Dict, List


async def iter_litellm_tokens(
    messages: List[Dict[str, Any]],
    call_kwargs: Dict[str, Any],
) -> AsyncIterator[str]:
    import litellm

    timeout_s = float(call_kwargs.get("timeout", 60))
    connect_timeout = min(timeout_s, 35.0)
    chunk_timeout = min(timeout_s, 45.0)

    response = await asyncio.wait_for(
        litellm.acompletion(messages=messages, stream=True, **call_kwargs),
        timeout=connect_timeout,
    )

    try:
        while True:
            try:
                chunk = await asyncio.wait_for(
                    response.__anext__(),
                    timeout=chunk_timeout,
                )
            except StopAsyncIteration:
                break
            content = chunk.choices[0].delta.content
            if content:
                yield content
    finally:
        if hasattr(response, "aclose"):
            await response.aclose()
