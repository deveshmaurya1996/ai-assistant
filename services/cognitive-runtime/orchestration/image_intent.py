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

    if re.search(
        r"\b(analyze|describe|read|ocr|extract text|what(?:'s| is) in (?:this|the)"
        r" (?:image|photo|file|document|pdf|screenshot))\b",
        q,
    ):
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
