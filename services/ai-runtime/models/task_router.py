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
    ]
    if has_image_attachment and any(re.search(p, q) for p in edit_signals):
        return "image_edit"

    generate_signals = [
        r"\b(generate|create|draw|design|render|paint|illustrate|sketch)\b",
        r"\b(make|produce)\b.+\b(image|picture|photo|illustration|logo|poster|artwork|icon)\b",
        r"\b(image|picture|photo|illustration|logo|poster)\b.+\b(of|showing|with|featuring)\b",
        r"\bdraw\b.+\b(me|a|an)\b",
    ]
    if any(re.search(p, q) for p in generate_signals):
        return "image"

    return None


def classify_task(query: str, explicit_task: Optional[str] = None) -> str:
    if explicit_task and explicit_task.strip() and explicit_task.strip() != "auto":
        return explicit_task.strip()

    q = query.lower().strip()
    if not q:
        return "fast_chat"

    image_intent = classify_image_intent(query)
    if image_intent == "image":
        return "image"

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
    q = query.lower()
    signals = [
        "remember",
        "recall",
        "what did i",
        "from my notes",
        "from my memory",
        "search my",
        "in my documents",
        "knowledge base",
        "previously",
        "last time we",
    ]
    return any(s in q for s in signals)
