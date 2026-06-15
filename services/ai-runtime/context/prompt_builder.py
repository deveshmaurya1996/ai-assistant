from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from env_loader import find_monorepo_root

_PROMPT_CACHE: Dict[str, str] = {}


def _planner_config_root() -> Path:
    explicit = os.getenv("PLANNER_CONFIG_ROOT", "").strip()
    if explicit:
        return Path(explicit)
    return find_monorepo_root() / "planner-config" / "planner"


def _prompt_version(kind: str, default: str = "v1") -> str:
    combined = os.getenv("PLANNER_PROMPT_VERSION", "").strip()
    if combined:
        for part in combined.split(","):
            key, _, val = part.partition(":")
            if key.strip() == kind and val.strip():
                return val.strip()
    env_key = f"{kind.upper()}_PROMPT_VERSION"
    return os.getenv(env_key, default).strip() or default


def render_template(text: str, variables: Dict[str, str]) -> str:
    out = text
    for key, value in variables.items():
        out = out.replace(f"{{{{{key}}}}}", value)
    return out


@lru_cache(maxsize=16)
def _read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def load_prompt_file(kind: str, filename: str) -> str:
    version = _prompt_version(kind)
    cache_key = f"{kind}:{version}:{filename}"
    if cache_key in _PROMPT_CACHE:
        return _PROMPT_CACHE[cache_key]
    path = _planner_config_root() / kind / version / filename
    if not path.exists():
        raise FileNotFoundError(f"Planner prompt not found: {path}")
    text = _read_text(str(path))
    _PROMPT_CACHE[cache_key] = text
    return text


def load_capability_system_prompt() -> str:
    return load_prompt_file("capability", "system.md")


def load_scheduling_system_prompt(
    *,
    now_iso: str,
    timezone_note: str,
    pending_block: str,
    automations_block: str,
) -> str:
    platform_block = load_prompt_file("scheduling", "platform.md")
    template = load_prompt_file("scheduling", "system.md")
    return render_template(
        template,
        {
            "now_iso": now_iso,
            "timezone_note": timezone_note,
            "pending_block": pending_block,
            "automations_block": automations_block,
            "platform_block": platform_block,
        },
    )


def _parse_simple_yaml_list(raw: str) -> List[Dict[str, Any]]:
    """Minimal YAML list parser for examples files (no PyYAML dependency)."""
    items: List[Dict[str, Any]] = []
    current: Dict[str, Any] | None = None
    for line in raw.splitlines():
        if line.startswith("- id:"):
            if current:
                items.append(current)
            current = {"id": line.split(":", 1)[1].strip()}
            continue
        if current is None:
            continue
        if line.startswith("  query:"):
            current["query"] = line.split(":", 1)[1].strip()
        elif line.startswith("  output:"):
            current["output"] = line.split(":", 1)[1].strip().strip("'\"")
    if current:
        items.append(current)
    return items


def load_examples(kind: str) -> List[Dict[str, Any]]:
    try:
        raw = load_prompt_file(kind, "examples.yaml")
    except FileNotFoundError:
        return []
    return _parse_simple_yaml_list(raw)


def _tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2}


def pick_examples(query: str, kind: str, k: int = 3) -> List[Dict[str, Any]]:
    examples = load_examples(kind)
    if not examples:
        return []
    q_tokens = _tokenize(query)
    if not q_tokens:
        return examples[:k]

    scored: List[tuple[int, Dict[str, Any]]] = []
    for ex in examples:
        ex_query = str(ex.get("query", ""))
        overlap = len(q_tokens & _tokenize(ex_query))
        scored.append((overlap, ex))
    scored.sort(key=lambda item: item[0], reverse=True)
    top = [ex for score, ex in scored if score > 0][:k]
    return top if top else examples[: min(k, len(examples))]


def render_examples_block(examples: List[Dict[str, Any]]) -> str:
    if not examples:
        return ""
    lines = ["Few-shot examples:"]
    for ex in examples:
        lines.append(f"User: {ex.get('query', '')}")
        lines.append(f"Assistant: {ex.get('output', '')}")
    return "\n".join(lines)


def active_prompt_versions() -> Dict[str, str]:
    return {
        "capability": _prompt_version("capability"),
        "scheduling": _prompt_version("scheduling"),
    }
