from __future__ import annotations

from typing import Any, Dict, Optional

from models.config_loader import get_task_profile

_TASKS_WITH_THINKING = frozenset({"reasoning", "planner"})


def _disable_thinking_extra_body(extra: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(extra)
    chat_kwargs = dict(out.get("chat_template_kwargs") or {})
    chat_kwargs["thinking"] = False
    chat_kwargs["enable_thinking"] = False
    if chat_kwargs:
        out["chat_template_kwargs"] = chat_kwargs
    out.pop("reasoning_budget", None)
    if "reasoning_effort" in out:
        out["reasoning_effort"] = "low"
    return out


def apply_task_policy(
    kwargs: Dict[str, Any],
    task: Optional[str],
    *,
    allow_thinking: Optional[bool] = None,
) -> Dict[str, Any]:
    """Apply per-task param overrides (thinking, caps) from task + YAML taskProfiles."""
    normalized = (task or "").strip()
    profile = get_task_profile(normalized) if normalized else {}

    if allow_thinking is None and profile.get("allowThinking") is not None:
        allow_thinking = bool(profile["allowThinking"])
    if allow_thinking is None:
        allow_thinking = normalized in _TASKS_WITH_THINKING

    extra = kwargs.get("extra_body")
    if isinstance(extra, dict) and extra and not allow_thinking:
        updated = dict(kwargs)
        updated["extra_body"] = _disable_thinking_extra_body(extra)
        kwargs = updated

    max_tokens = profile.get("maxTokens")
    if max_tokens is not None:
        updated = dict(kwargs)
        updated["max_tokens"] = int(max_tokens)
        kwargs = updated

    return kwargs
