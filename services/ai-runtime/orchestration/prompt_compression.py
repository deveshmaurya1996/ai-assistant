from __future__ import annotations

import logging
import os
import time
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_KEEP_RECENT = int(os.getenv("PROMPT_COMPRESS_KEEP_RECENT", "4"))
_BUDGET_MS = float(os.getenv("PROMPT_COMPRESS_BUDGET_MS", "3000"))
_RATIO = float(os.getenv("PROMPT_COMPRESS_RATIO", "0.5"))
_FALLBACK_WINDOW = 32_000


class ContextPriority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


def estimate_tokens(text: str) -> int:
    return max(0, len(text or "") // 4)


def _absolute_threshold_override() -> Optional[int]:
    raw = os.getenv("PROMPT_COMPRESS_TOKEN_THRESHOLD", "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _load_context_window_for_task(task: str) -> int:
    try:
        import yaml

        root = Path(__file__).resolve().parents[3]
        path = root / "planner-config" / "ai-models.yaml"
        if not path.is_file():
            return _FALLBACK_WINDOW
        cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        tiers = (cfg.get("routingTiers") or {}).get(task) or (
            cfg.get("routingTiers") or {}
        ).get("fast_chat") or {}
        primary = (tiers.get("tier1") or [None])[0]
        if not primary:
            return _FALLBACK_WINDOW
        for entry in cfg.get("models") or []:
            if entry.get("id") == primary:
                window = entry.get("contextWindow")
                if window is not None:
                    return int(window)
    except Exception as exc:
        logger.debug("[compress] context window lookup failed: %s", exc)
    return _FALLBACK_WINDOW


def compression_threshold_tokens(task: str) -> int:
    override = _absolute_threshold_override()
    if override is not None:
        return override
    window = _load_context_window_for_task(task)
    return max(1000, int(window * _RATIO))


def _truncate_text(text: str, max_tokens: int) -> str:
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n…(truncated)"


def _history_text(messages: List[Dict[str, str]]) -> str:
    parts: List[str] = []
    for msg in messages:
        role = msg.get("role", "user")
        content = str(msg.get("content") or "")
        if content.strip():
            parts.append(f"{role}: {content}")
    return "\n".join(parts)


async def _summarize_block(
    text: str,
    *,
    user_id: str,
    timeout_s: float,
) -> str:
    from ai_client import ai_http_client, ai_request_url

    prompt = (
        "Summarize the following conversation/context concisely. "
        "Preserve key facts, decisions, and names.\n\n"
        f"{text}"
    )
    async with ai_http_client(timeout=timeout_s) as client:
        res = await client.post(
            ai_request_url("/v1/chat/complete"),
            json={
                "query": prompt,
                "rag_enabled": False,
                "chat_history": [],
                "user_id": user_id,
                "task": "summary",
                "task_locked": True,
                "allow_thinking": False,
            },
        )
        res.raise_for_status()
        data = res.json()
    summary = str(data.get("text", "")).strip()
    return summary or _truncate_text(text, max(256, estimate_tokens(text) // 2))


def _split_history(
    chat_history: List[Dict[str, str]], keep_recent: int
) -> tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    if len(chat_history) <= keep_recent:
        return [], list(chat_history)
    split = len(chat_history) - keep_recent
    return list(chat_history[:split]), list(chat_history[split:])


async def compress_prompt_if_needed(
    *,
    chat_history: List[Dict[str, str]],
    context_str: Optional[str],
    tool_context: str,
    user_query: str,
    user_id: str,
    task: str,
    speed_profile: str,
    deadline_ms: int,
) -> Tuple[List[Dict[str, str]], Optional[str], Dict[str, float]]:
    timings: Dict[str, float] = {}
    if speed_profile == "voice_realtime":
        timings["compress_skipped"] = 1.0
        return chat_history, context_str, timings

    high_text = (user_query or "") + (tool_context or "")
    threshold = compression_threshold_tokens(task)
    total = (
        estimate_tokens(high_text)
        + estimate_tokens(_history_text(chat_history))
        + estimate_tokens(context_str or "")
    )
    timings["compress_tokens_before"] = float(total)
    timings["compress_threshold_tokens"] = float(threshold)

    if total <= threshold:
        timings["compress_ms"] = 0.0
        timings["compress_tokens_after"] = float(total)
        return chat_history, context_str, timings

    t0 = time.perf_counter()
    budget_s = min(_BUDGET_MS / 1000.0, max(0.5, deadline_ms / 1000.0 * 0.1))
    stages: List[str] = []

    old_history, recent_history = _split_history(chat_history, _KEEP_RECENT)
    compressed_history = list(recent_history)
    compressed_context = context_str

    low_text = _history_text(old_history)
    if low_text.strip():
        try:
            summary = await _summarize_block(
                low_text, user_id=user_id, timeout_s=budget_s
            )
            compressed_history = [
                {
                    "role": "system",
                    "content": f"Earlier conversation summary:\n{summary}",
                },
                *compressed_history,
            ]
            stages.append("low_history_summary")
        except Exception as exc:
            logger.warning("[compress] low history summary failed: %s", exc)
            stages.append("low_history_drop")

    total = (
        estimate_tokens(high_text)
        + estimate_tokens(_history_text(compressed_history))
        + estimate_tokens(compressed_context or "")
    )

    if total > threshold and compressed_context:
        medium_budget = estimate_tokens(compressed_context or "") - max(
            0, total - threshold
        )
        if medium_budget > 0:
            compressed_context = _truncate_text(
                compressed_context, estimate_tokens(compressed_context) - medium_budget
            )
            stages.append("medium_context_truncate")

    total = (
        estimate_tokens(high_text)
        + estimate_tokens(_history_text(compressed_history))
        + estimate_tokens(compressed_context or "")
    )
    while total > threshold and len(compressed_history) > 1:
        compressed_history.pop(0)
        total = (
            estimate_tokens(high_text)
            + estimate_tokens(_history_text(compressed_history))
            + estimate_tokens(compressed_context or "")
        )
        stages.append("medium_history_drop")

    timings["compress_ms"] = (time.perf_counter() - t0) * 1000
    timings["compress_tokens_after"] = float(total)
    timings["compress_priority_stages"] = float(len(stages))
    logger.info(
        "[compress] before=%.0f after=%.0f threshold=%.0f stages=%s ms=%.0f",
        timings["compress_tokens_before"],
        timings["compress_tokens_after"],
        threshold,
        stages,
        timings["compress_ms"],
    )
    return compressed_history, compressed_context, timings
