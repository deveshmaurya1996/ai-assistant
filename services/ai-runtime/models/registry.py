from __future__ import annotations

import logging
from enum import Enum
from typing import Any, Dict, List, Optional

from models.config_loader import get_rag_config, get_timeouts
from models.model_resolver import (
    get_models_catalog as _get_models_catalog,
    label_for,
    litellm_kwargs,
    log_startup_summary,
    model_is_available,
    pollinations_api_key,
    pollinations_base_url,
    resolve_chain,
    _pollinations_api_key,
    _pollinations_base_url,
)
from models.task_router import classify_image_intent, classify_task

logger = logging.getLogger(__name__)


class Capability(str, Enum):
    TEXT = "text"
    TRANSCRIPTION = "transcription"
    SPEECH = "speech"
    IMAGE = "image"
    IMAGE_EDIT = "image_edit"


_CAPABILITY_TO_TASK = {
    Capability.TEXT: "fast_chat",
    Capability.TRANSCRIPTION: "transcription",
    Capability.SPEECH: "speech",
    Capability.IMAGE: "image",
    Capability.IMAGE_EDIT: "image_edit",
}


def is_pollinations_model(model_name: str) -> bool:
    return model_name.startswith("pollinations/")


def is_nvidia_model(model_name: str) -> bool:
    return model_name.startswith("nvidia/")


def get_planner_model() -> Optional[str]:
    chain = resolve_chain("planner")
    return chain[0] if chain else None


def get_nvidia_model_id() -> str:
    for task in ("fast_chat", "reasoning", "coding"):
        for mid in resolve_chain(task):
            if is_nvidia_model(mid):
                return mid
    return "nvidia/glm-5.1"


def resolve_models(
    capability: Capability,
    preferred: Optional[str] = None,
    *,
    task: Optional[str] = None,
    query: Optional[str] = None,
) -> List[str]:
    if task:
        return resolve_chain(task)
    if preferred and preferred.strip() and preferred.strip() != "auto":
        if model_is_available(preferred):
            chain = [preferred]
            fb = resolve_chain("fallback")
            if fb and fb[0] not in chain:
                chain.append(fb[0])
            return chain
    if query:
        return resolve_chain(classify_task(query))
    return resolve_chain(_CAPABILITY_TO_TASK.get(capability, "fast_chat"))


def get_primary_model(capability: Capability) -> str:
    chain = resolve_models(capability)
    return chain[0] if chain else "pollinations/openai"


def get_fallback_model(capability: Capability) -> Optional[str]:
    chain = resolve_models(capability)
    if len(chain) > 1:
        return chain[1]
    fb = resolve_chain("fallback")
    return fb[0] if fb else None


def sanitize_model_id(model: str, capability: Capability) -> str:
    if model_is_available(model):
        return model
    return get_primary_model(capability)


def pollinations_model_id(model_name: str) -> str:
    if model_name.startswith("pollinations/"):
        return model_name.split("/", 1)[-1]
    return model_name


def nvidia_model_id(model_name: str) -> str:
    if model_name.startswith("nvidia/"):
        return model_name.split("/", 1)[-1]
    return model_name


def get_models_catalog() -> Dict[str, Any]:
    return _get_models_catalog()


__all__ = [
    "Capability",
    "classify_task",
    "classify_image_intent",
    "get_models_catalog",
    "get_planner_model",
    "get_primary_model",
    "get_fallback_model",
    "get_rag_config",
    "get_timeouts",
    "label_for",
    "litellm_kwargs",
    "log_startup_summary",
    "model_is_available",
    "resolve_chain",
    "resolve_models",
    "sanitize_model_id",
    "pollinations_model_id",
    "pollinations_api_key",
    "pollinations_base_url",
    "nvidia_model_id",
    "is_pollinations_model",
    "is_nvidia_model",
]
