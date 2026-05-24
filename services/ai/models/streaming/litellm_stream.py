
from __future__ import annotations

import asyncio
import threading
from typing import Any, AsyncIterator, Dict, List


async def iter_litellm_tokens(
    messages: List[Dict[str, str]],
    call_kwargs: Dict[str, Any],
) -> AsyncIterator[str]:
    import litellm

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()

    def producer() -> None:
        try:
            response = litellm.completion(
                messages=messages,
                stream=True,
                **call_kwargs,
            )
            for chunk in response:
                content = chunk.choices[0].delta.content
                if content:
                    loop.call_soon_threadsafe(queue.put_nowait, ("chunk", content))
            loop.call_soon_threadsafe(queue.put_nowait, ("done", None))
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, ("error", exc))

    thread = threading.Thread(target=producer, daemon=True)
    thread.start()

    try:
        while True:
            kind, payload = await queue.get()
            if kind == "chunk":
                yield payload
                await asyncio.sleep(0)
            elif kind == "done":
                return
            elif kind == "error":
                if isinstance(payload, BaseException):
                    raise payload
                raise RuntimeError(str(payload))
            else:
                raise RuntimeError(f"Unexpected stream event: {kind!r}")
    finally:
        thread.join(timeout=0.5)
