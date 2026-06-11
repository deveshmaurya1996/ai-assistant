from __future__ import annotations

import json
import re
from typing import Any, Dict


def parse_llm_json(raw: str) -> Dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {}

    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()

    candidates = [text]
    obj_match = re.search(r"\{[\s\S]*\}", text)
    if obj_match and obj_match.group(0) != text:
        candidates.append(obj_match.group(0))

    for candidate in candidates:
        try:
            data = json.loads(candidate)
            if isinstance(data, dict):
                return data
        except Exception:
            continue
    return {"capabilities": [], "tools": []}
