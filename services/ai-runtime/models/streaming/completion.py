
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List, Optional, Tuple

from models.registry import (
    Capability,
    classify_task,
    label_for,
    litellm_kwargs,
    model_is_available,
    resolve_chain,
    resolve_models,
)
from models.config_loader import timeout_for_model
from models.orchestration.completion_orchestrator import (
    complete_text_orchestrated,
    stream_text_orchestrated,
)
from models.providers.nvidia_vlm import (
    VlmNoImageError,
    complete_vlm,
    is_nvidia_vlm_model,
    iter_vlm_tokens,
)
from models.streaming.litellm_stream import iter_litellm_tokens
from models.streaming.simulation import context_from_messages, iter_simulation_tokens
from models.streaming.sse import sse_done, sse_error, sse_token

logger = logging.getLogger(__name__)


def _has_any_provider_key() -> bool:
    return bool(
        os.getenv("NVIDIA_API_KEY")
        or os.getenv("GROQ_API_KEY")
        or os.getenv("POLLINATIONS_API_KEY")
    )


def _messages_have_image_attachments(messages: List[Dict[str, Any]]) -> bool:
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "image_url":
                    return True
    return False


def _last_user_text(messages: List[Dict[str, Any]]) -> str:
    if not messages:
        return ""
    content = messages[-1].get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            p.get("text", "")
            for p in content
            if isinstance(p, dict) and p.get("type") == "text"
        ]
        return " ".join(parts)
    return str(content)


def _resolve_chat_models(
    messages: List[Dict[str, Any]],
    task: Optional[str] = None,
    *,
    task_locked: bool = False,
) -> Tuple[List[str], str]:
    query = _last_user_text(messages)
    explicit = (task or "").strip()
    if task_locked and explicit and explicit != "auto":
        resolved_task = explicit
    else:
        resolved_task = classify_task(query, task)
    if resolved_task in ("vision", "file_analysis") and not _messages_have_image_attachments(
        messages
    ):
        resolved_task = "reasoning"
    models = resolve_chain(resolved_task)
    if not models:
        models = resolve_models(Capability.TEXT, query=query)
    return models, resolved_task


def _needs_attachment_keys(resolved_task: str, messages: List[Dict[str, Any]]) -> bool:
    return resolved_task == "file_analysis" or _messages_have_image_attachments(messages)


def _log_model_fallback(
    model_name: str,
    exc: Exception,
    models: List[str],
    idx: int,
) -> None:
    next_model = models[idx + 1] if idx + 1 < len(models) else None
    logger.warning(
        "[chat] model %s failed (%s): %s — falling back to %s",
        model_name,
        type(exc).__name__,
        exc,
        next_model or "none",
    )


async def _stream_vision_sequential(
    messages: List[Dict[str, Any]],
    models: List[str],
    resolved_task: str,
    *,
    cancel_event: Optional[asyncio.Event] = None,
) -> AsyncIterator[str]:
    t0 = time.perf_counter()
    last_error: Optional[Exception] = None
    first_token_logged = False

    for idx, model_name in enumerate(models):
        if cancel_event and cancel_event.is_set():
            raise asyncio.CancelledError()
        if not model_is_available(model_name):
            continue
        try:
            if is_nvidia_vlm_model(model_name):
                timeout = float(timeout_for_model(model_name, stream=True))
                async for token in iter_vlm_tokens(
                    messages, model_name, timeout=timeout
                ):
                    if cancel_event and cancel_event.is_set():
                        raise asyncio.CancelledError()
                    if not first_token_logged:
                        logger.info(
                            "[chat] time_to_first_token_ms=%.0f task=%s model=%s",
                            (time.perf_counter() - t0) * 1000,
                            resolved_task,
                            model_name,
                        )
                        first_token_logged = True
                    yield sse_token(token)
                yield sse_done(model_name, label_for(model_name))
                return

            call_kwargs = litellm_kwargs(model_name, stream=True, task=resolved_task)
            async for token in iter_litellm_tokens(messages, call_kwargs):
                if cancel_event and cancel_event.is_set():
                    raise asyncio.CancelledError()
                if not first_token_logged:
                    logger.info(
                        "[chat] time_to_first_token_ms=%.0f task=%s model=%s",
                        (time.perf_counter() - t0) * 1000,
                        resolved_task,
                        model_name,
                    )
                    first_token_logged = True
                yield sse_token(token)
            yield sse_done(model_name, label_for(model_name))
            return
        except VlmNoImageError as exc:
            logger.info("[chat] skipping %s: %s", model_name, exc)
            continue
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            last_error = exc
            _log_model_fallback(model_name, exc, models, idx)

    yield sse_error(f"All models failed: {last_error}")
    yield sse_done()


async def stream_completion_sse(
    messages: List[Dict[str, Any]],
    task: Optional[str] = None,
    *,
    allow_thinking: Optional[bool] = None,
    deadline_ms: Optional[float] = None,
    task_locked: bool = False,
    cancel_event: Optional[asyncio.Event] = None,
) -> AsyncIterator[str]:
    """Yield SSE-formatted frames: token, error, and done events."""
    t0 = time.perf_counter()
    models, resolved_task = _resolve_chat_models(
        messages, task, task_locked=task_locked
    )
    logger.info("[chat] task=%s model_chain=%s", resolved_task, models)

    if not _has_any_provider_key() or not models:
        if _needs_attachment_keys(resolved_task, messages):
            yield sse_error(
                "Attachment analysis requires NVIDIA_API_KEY, GROQ_API_KEY, or POLLINATIONS_API_KEY."
            )
            yield sse_done()
            return
        query = _last_user_text(messages)
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

    if resolved_task in ("vision", "file_analysis") and _messages_have_image_attachments(
        messages
    ):
        async for frame in _stream_vision_sequential(
            messages, models, resolved_task, cancel_event=cancel_event
        ):
            yield frame
        return

    try:
        async for frame in stream_text_orchestrated(
            messages,
            resolved_task,
            allow_thinking=allow_thinking,
            deadline_ms=deadline_ms,
            cancel_event=cancel_event,
        ):
            yield frame
        return
    except asyncio.CancelledError:
        raise
    except RuntimeError as exc:
        yield sse_error(str(exc))
        yield sse_done()
        return


async def complete_text(
    messages: List[Dict[str, Any]],
    task: Optional[str] = None,
    *,
    cancel_event: Optional[asyncio.Event] = None,
) -> Tuple[str, Optional[str]]:
    models, resolved_task = _resolve_chat_models(messages, task)

    if not _has_any_provider_key() or not models:
        if _needs_attachment_keys(resolved_task, messages):
            return (
                "Attachment analysis requires NVIDIA_API_KEY, GROQ_API_KEY, or POLLINATIONS_API_KEY.",
                None,
            )
        query = _last_user_text(messages)
        context = context_from_messages(messages)
        out = ""
        async for token in iter_simulation_tokens(query, context):
            out += token
        return out.strip(), None

    try:
        import litellm

        litellm.suppress_debug_info = True
    except ImportError:
        return "LiteLLM is not installed", None

    if resolved_task not in ("vision", "file_analysis"):
        return await complete_text_orchestrated(
            messages, resolved_task, cancel_event=cancel_event
        )

    async def complete_one(model_name: str) -> str:
        if is_nvidia_vlm_model(model_name):
            timeout_s = float(timeout_for_model(model_name, stream=False)) + 5.0
            return await asyncio.wait_for(
                complete_vlm(messages, model_name, timeout=timeout_s),
                timeout=timeout_s,
            )

        call_kwargs = litellm_kwargs(model_name, stream=False, task=resolved_task)
        timeout_s = float(call_kwargs.get("timeout", 60)) + 5.0
        resp = await asyncio.wait_for(
            litellm.acompletion(messages=messages, stream=False, **call_kwargs),
            timeout=timeout_s,
        )
        text = (
            resp.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        return str(text).strip()

    result, model_used, last_error = await _run_model_chain(
        models,
        complete_one,
        skip_errors=(VlmNoImageError,),
    )
    if result is not None:
        return result, model_used
    return f"All models failed: {last_error}", None


async def _run_model_chain(
    models: List[str],
    attempt: Callable[[str], Awaitable[str]],
    *,
    skip_errors: Tuple[type[BaseException], ...] = (),
) -> Tuple[Optional[str], Optional[str], Optional[Exception]]:
    last_error: Optional[Exception] = None
    for idx, model_name in enumerate(models):
        if not model_is_available(model_name):
            continue
        try:
            result = await attempt(model_name)
            return result, model_name, None
        except skip_errors as exc:
            logger.info("[chat] skipping %s: %s", model_name, exc)
            continue
        except Exception as exc:
            last_error = exc
            _log_model_fallback(model_name, exc, models, idx)
    return None, None, last_error
