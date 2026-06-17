from __future__ import annotations

import re
from typing import Literal, Optional

from orchestration.image_intent import classify_image_intent

ImageIntent = Literal["image", "image_edit"]

__all__ = ["ImageIntent", "classify_image_intent", "classify_task", "is_rag_relevant_query"]


def classify_task(query: str, explicit_task: Optional[str] = None) -> str:
    image_intent = classify_image_intent(query)
    if image_intent == "image":
        return "image"

    if explicit_task and explicit_task.strip() and explicit_task.strip() != "auto":
        return explicit_task.strip()

    q = query.lower().strip()
    if not q:
        return "fast_chat"

    if re.search(
        r"\b(analyze|describe|read|ocr|extract text|what(?:'s| is) in (?:this|the)"
        r" (?:image|photo|file|document|pdf|screenshot))\b",
        q,
    ) or re.search(r"\b(image|photo|screenshot|pdf|document|uploaded file)\b", q):
        return "file_analysis"

    if re.search(r"```", query) or re.search(
        r"\b(implement|refactor|fix bug|write code|function|class|debug)\b", q
    ):
        return "coding"

    if re.search(
        r"\b(explain why|analyze|compare|step by step|reasoning|pros and cons|evaluate)\b",
        q,
    ) or len(q.split()) > 80:
        return "reasoning"

    if re.search(r"\b(summarize|summary|tl;dr|tldr|brief overview)\b", q):
        return "summary"

    return "fast_chat"


def is_rag_relevant_query(query: str) -> bool:
    """Align with smart retrieval in context_builder (see should_retrieve_rag_context)."""
    import os

    if os.getenv("RAG_RETRIEVAL_MODE", "smart").strip().lower() == "always":
        return bool((query or "").strip())

    q = (query or "").strip()
    if not q:
        return False

    lower = q.lower()
    if re.match(
        r"^(?:hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|cool|great|bye|goodbye"
        r"|good morning|good night)[\s!.?]*$",
        q,
        re.IGNORECASE,
    ):
        return False

    signals = (
        "remember",
        "recall",
        "what did i",
        "what did we",
        "what have we",
        "from my notes",
        "from my memory",
        "search my",
        "in my documents",
        "knowledge base",
        "previously",
        "last time we",
        "we discussed",
        "we talked",
        "you told me",
        "do you remember",
        "our conversation",
        "my notes",
        "about me",
    )
    if any(s in lower for s in signals):
        return True

    if re.search(
        r"\b(?:what(?:'s| is) my|when did i|do you know my)\b",
        lower,
    ):
        return True

    if len(q) < 24 and "?" not in q:
        return False

    return False
