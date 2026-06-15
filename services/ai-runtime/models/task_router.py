from __future__ import annotations

import re
from typing import Literal, Optional

ImageIntent = Literal["image", "image_edit"]


def classify_image_intent(
    query: str, *, has_image_attachment: bool = False
) -> Optional[ImageIntent]:
    q = query.lower().strip()
    if not q:
        return None

    analysis = re.search(
        r"\b(analyze|describe|read|ocr|extract text|what(?:'s| is) in (?:this|the)"
        r" (?:image|photo|file|document|pdf|screenshot))\b",
        q,
    )
    if analysis:
        return None

    edit_signals = [
        r"\b(edit|modify|retouch|inpaint|change|alter|update)\b",
        r"\b(remove|add|replace|erase)\b.+\b(from|in|on)\b",
        r"\bmake\b.+\b(sky|background|hair|color|colou?r)\b",
        r"\b(the|this|that|previous|last)\s+(generated\s+)?(image|picture|photo)\b",
    ]
    if has_image_attachment and any(re.search(p, q) for p in edit_signals):
        return "image_edit"

    generate_signals = [
        r"\b(generate|create|draw|design|render|paint|illustrate|sketch)\b",
        r"\b(make|produce)\b.+\b(image|picture|photo|illustration|logo|poster|artwork|icon)\b",
        r"\b(image|picture|photo|illustration|logo|poster)\b.+\b(of|showing|with|featuring)\b",
        r"\bdraw\b.+\b(me|a|an)\b",
        r"\bshow me\b.+\b(picture|image|photo|illustration)\b",
        r"\bmake me\b.+\b(an?\s+)?(image|picture|photo|illustration)\b",
    ]
    if any(re.search(p, q) for p in generate_signals):
        return "image"

    return None


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
