
from __future__ import annotations

import asyncio
from typing import AsyncIterator, Dict, List


def context_from_messages(messages: List[Dict[str, str]]) -> str:
    for message in messages:
        if message.get("role") == "system" and "Retrieved Context" in message.get(
            "content", ""
        ):
            return message["content"]
    return ""


async def iter_simulation_tokens(
    query: str, context_str: str
) -> AsyncIterator[str]:
    yield "[Simulation Mode - No API keys configured]\n"
    await asyncio.sleep(0.02)
    if context_str:
        yield "Retrieved context was used.\n"
        response_text = f"Based on context, here is a response to: {query}"
    else:
        response_text = f"General response to: {query}"
    for word in response_text.split():
        yield f"{word} "
        await asyncio.sleep(0.03)
