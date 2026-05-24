
from __future__ import annotations

import logging
import os
from typing import AsyncIterator, Dict, List, Optional

from models.registry import Capability, litellm_kwargs, model_is_available, resolve_models
from models.streaming.litellm_stream import iter_litellm_tokens
from models.streaming.simulation import context_from_messages, iter_simulation_tokens
from models.streaming.sse import sse_done, sse_error, sse_token

logger = logging.getLogger(__name__)


def _has_any_provider_key() -> bool:
    return bool(
        os.getenv("GEMINI_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("ANTHROPIC_API_KEY")
        or os.getenv("POLLINATIONS_API_KEY")
    )


async def stream_completion_sse(
    messages: List[Dict[str, str]],
    preferred_model: Optional[str] = None,
) -> AsyncIterator[str]:
    """Yield SSE-formatted frames: token, error, and done events."""
    models = resolve_models(Capability.TEXT, preferred_model)

    if not _has_any_provider_key() or not models:
        query = messages[-1]["content"] if messages else ""
        context = context_from_messages(messages)
        async for token in iter_simulation_tokens(query, context):
            yield sse_token(token)
        yield sse_done()
        return

    try:
        import litellm

        litellm.suppress_debug_info = True
    except ImportError:
        yield sse_error("LiteLLM is not installed")
        yield sse_done()
        return

    last_error: Optional[Exception] = None
    for model_name in models:
        if not model_is_available(model_name):
            continue
        try:
            call_kwargs = litellm_kwargs(model_name)
            async for token in iter_litellm_tokens(messages, call_kwargs):
                yield sse_token(token)
            logger.info("Chat completed via %s", model_name)
            yield sse_done(model_name)
            return
        except Exception as exc:
            last_error = exc
            logger.warning("Text model %s failed: %s", model_name, exc)

    yield sse_error(f"All models failed: {last_error}")
    yield sse_done()
