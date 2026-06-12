from __future__ import annotations

import logging
import re
from typing import Optional

from models.registry import label_for, litellm_kwargs, model_is_available, resolve_chain

logger = logging.getLogger(__name__)

_TITLE_SYSTEM = (
    "You generate short chat session titles. "
    "Reply with only a 3–6 word title summarizing the conversation topic. "
    "No quotes, no punctuation at the end, no explanation."
)


def _sanitize_title(raw: str, *, user_excerpt: str = "") -> str:
    text = raw.strip().strip('"\'').strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) > 80:
        text = text[:77] + "..."
    if text:
        return text
    trimmed_user = user_excerpt.strip()
    if trimmed_user:
        return trimmed_user[:27] + "..." if len(trimmed_user) > 30 else trimmed_user
    return "New Chat"


def _user_excerpt_fallback(user_message: str) -> str:
    user_excerpt = user_message.strip()[:500]
    if not user_excerpt:
        return "New Chat"
    return user_excerpt[:27] + "..." if len(user_excerpt) > 30 else user_excerpt


def generate_chat_title(user_message: str, assistant_message: str) -> str:
    user_excerpt = user_message.strip()[:500]
    assistant_excerpt = assistant_message.strip()[:500]
    fallback = _user_excerpt_fallback(user_message)

    models = resolve_chain("title")
    messages = [
        {"role": "system", "content": _TITLE_SYSTEM},
        {
            "role": "user",
            "content": (
                f"User: {user_excerpt}\n\n"
                f"Assistant: {assistant_excerpt}\n\n"
                "Title:"
            ),
        },
    ]

    try:
        import litellm

        litellm.suppress_debug_info = True
    except ImportError:
        return _sanitize_title(fallback, user_excerpt=user_excerpt)

    last_error: Optional[Exception] = None
    for model_name in models:
        if not model_is_available(model_name):
            continue
        try:
            call_kwargs = {
                **litellm_kwargs(model_name, stream=False, task="title"),
                "max_tokens": 24,
                "temperature": 0.3,
            }
            response = litellm.completion(messages=messages, **call_kwargs)
            content = response.choices[0].message.content
            if content and str(content).strip():
                title = _sanitize_title(str(content), user_excerpt=user_excerpt)
                logger.info("Chat title generated via %s: %s", model_name, title)
                return title
        except Exception as exc:
            last_error = exc
            logger.warning("Title model %s failed: %s", model_name, exc)

    logger.warning("Title generation failed, using fallback: %s", last_error)
    return _sanitize_title(fallback, user_excerpt=user_excerpt)
