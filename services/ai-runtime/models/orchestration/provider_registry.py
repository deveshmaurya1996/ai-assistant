from __future__ import annotations

from typing import Any, Dict, List

from models.config_loader import (
    get_orchestration_config,
    load_ai_models_config,
    routing_tiers_for_task,
)


def provider_config(provider: str) -> Dict[str, Any]:
    cfg = load_ai_models_config()
    return dict((cfg.get("providers") or {}).get(provider) or {})


def list_chat_providers() -> List[str]:
    cfg = load_ai_models_config()
    names: List[str] = []
    for name, prov in (cfg.get("providers") or {}).items():
        kind = str(prov.get("kind", ""))
        if kind in ("openai_compatible", "groq", "pollinations"):
            names.append(str(name))
    return names


def orchestration_settings() -> Dict[str, Any]:
    return get_orchestration_config()


def tiers_for_task(task: str) -> Dict[str, List[str]]:
    return routing_tiers_for_task(task)
