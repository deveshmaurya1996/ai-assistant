
from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, Dict, List

from models.streaming.completion import complete_text

logger = logging.getLogger(__name__)

_EXTRACT_SYSTEM = (
    "You extract durable facts about the user from a chat turn. "
    "Output ONLY a JSON array. Each item: "
    '{"type":"FACT"|"PREFERENCE","content":"..."}. '
    "Rules: 0-3 items; stable user-specific facts (name, job, company, resume highlights, preferences). "
    "If the user asks to remember/save/keep information, extract the key details they provided. "
    "No greetings or tool status; empty array [] only if truly nothing worth long-term memory."
)

_EXTRACT_SYSTEM_EXPLICIT_SAVE = (
    _EXTRACT_SYSTEM
    + " The user explicitly asked to save or remember — you MUST extract at least one fact "
    "capturing what they want stored (resume, company, role, contact info, etc.)."
)

_SAVE_CUES = re.compile(
    r"\b(remember|save this|keep this|store this|don't forget|do not forget|"
    r"for future|my resume|company is|i work at|i'm at|i am at)\b",
    re.IGNORECASE,
)

_VALID_TYPES = frozenset({"FACT", "PREFERENCE"})
_MAX_FACT_LENGTH = 500


def normalize_fact_content(content: str) -> str:
    text = re.sub(r"\s+", " ", (content or "").strip().lower())
    return text[:_MAX_FACT_LENGTH]


def fact_fingerprint(content: str) -> str:
    return hashlib.sha256(normalize_fact_content(content).encode("utf-8")).hexdigest()


def dedupe_facts(facts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[str] = set()
    out: List[Dict[str, Any]] = []
    for item in facts:
        content = str(item.get("content", "")).strip()
        if len(content) < 3:
            continue
        fp = fact_fingerprint(content)
        if fp in seen:
            continue
        seen.add(fp)
        out.append(item)
        if len(out) >= 3:
            break
    return out


def _parse_facts_json(raw: str) -> List[Dict[str, Any]]:
    text = raw.strip()
    if not text:
        return []
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in data[:3]:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content", "")).strip()
        if len(content) < 3 or len(content) > 500:
            continue
        kind = str(item.get("type", "FACT")).upper()
        if kind not in _VALID_TYPES:
            kind = "FACT"
        out.append({"type": kind, "content": content})
    return out


async def extract_facts(
    user_text: str,
    assistant_text: str,
    *,
    explicit_save: bool = False,
) -> List[Dict[str, Any]]:
    user_text = (user_text or "").strip()
    assistant_text = (assistant_text or "").strip()
    if not user_text and not assistant_text:
        return []

    use_explicit = explicit_save or bool(_SAVE_CUES.search(user_text))
    system = _EXTRACT_SYSTEM_EXPLICIT_SAVE if use_explicit else _EXTRACT_SYSTEM
    messages = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": (
                f"User message:\n{user_text}\n\n"
                f"Assistant reply:\n{assistant_text[:2000]}"
            ),
        },
    ]
    try:
        raw, _model = await complete_text(messages, task="fast_chat")
        facts = dedupe_facts(_parse_facts_json(raw or ""))
        if facts:
            logger.info("[memory] extracted %d fact(s)", len(facts))
        return facts
    except Exception as exc:
        logger.warning("[memory] fact extraction failed: %s", exc)
        return []


_ROUTER_SYSTEM = (
    "Decide if answering needs the user's long-term stored memory "
    "(past chats, saved facts, preferences) — not just the current thread. "
    'Reply JSON only: {"retrieve": true} or {"retrieve": false}.'
)


async def should_retrieve_via_llm(query: str) -> bool:
    q = (query or "").strip()
    if not q:
        return False
    messages = [
        {"role": "system", "content": _ROUTER_SYSTEM},
        {"role": "user", "content": q[:500]},
    ]
    try:
        raw, _model = await complete_text(messages, task="fast_chat")
        text = (raw or "").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
        data = json.loads(text)
        if isinstance(data, dict):
            return bool(data.get("retrieve"))
    except Exception as exc:
        logger.warning("[memory] retrieve router failed: %s", exc)
    return False
