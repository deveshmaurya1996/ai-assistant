from __future__ import annotations

import logging
import os
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class Capability(str, Enum):
    TEXT = "text"
    TRANSCRIPTION = "transcription"
    SPEECH = "speech"
    IMAGE = "image"

TEXT_PRIMARY_MODELS: List[Dict[str, str]] = [
    {"id": "gemini/gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro", "provider": "gemini"},
    {"id": "gpt-5.5", "label": "GPT-5.5", "provider": "openai"},
    {"id": "anthropic/claude-sonnet-4-6", "label": "Claude 4", "provider": "anthropic"},
]

MODEL_CATALOG: Dict[Capability, List[Dict[str, str]]] = {
    Capability.TEXT: TEXT_PRIMARY_MODELS,
    Capability.TRANSCRIPTION: [
        {"id": "whisper-1", "label": "OpenAI Whisper", "provider": "openai"},
    ],
    Capability.SPEECH: [
        {"id": "tts-1", "label": "OpenAI TTS", "provider": "openai"},
    ],
    Capability.IMAGE: [
        {"id": "dall-e-3", "label": "DALL·E 3", "provider": "openai"},
    ],
}

DEFAULTS: Dict[Capability, tuple[str, str]] = {
    Capability.TEXT: ("gemini/gemini-3.1-pro-preview", "pollinations/openai"),
    Capability.TRANSCRIPTION: ("whisper-1", "pollinations/whisper-1"),
    Capability.SPEECH: ("tts-1", "pollinations/openai-audio"),
    Capability.IMAGE: ("dall-e-3", "pollinations/flux"),
}

_LEGACY_TEXT_PRIMARY = "PRIMARY_MODEL"
_LEGACY_TEXT_FALLBACK = "FALLBACK_MODEL"

_POLLINATIONS_HTTP_HEADERS = {"User-Agent": "Ai-Assistant/1.0"}


def _pollinations_api_key() -> Optional[str]:
    return os.getenv("POLLINATIONS_API_KEY") or None


def _pollinations_base_url() -> str:
    return os.getenv("POLLINATIONS_BASE_URL", "https://gen.pollinations.ai").rstrip("/")


def _pollinations_v1_base() -> str:
    base = _pollinations_base_url()
    return base if base.endswith("/v1") else f"{base}/v1"


def _pollinations_fallback_id(capability: Capability) -> str:
    if capability == Capability.SPEECH:
        raw = os.getenv("POLLINATIONS_SPEECH_MODEL", "openai-audio").strip()
    elif capability == Capability.IMAGE:
        raw = os.getenv("POLLINATIONS_IMAGE_MODEL", "flux").strip()
    elif capability == Capability.TRANSCRIPTION:
        raw = os.getenv("POLLINATIONS_TRANSCRIPTION_MODEL", "whisper-1").strip()
    else:
        raw = os.getenv("POLLINATIONS_MODEL", "openai").strip()
    return raw if raw.startswith("pollinations/") else f"pollinations/{raw}"


def is_pollinations_model(model_name: str) -> bool:
    return model_name.startswith("pollinations/")


def is_catalog_text_model(model_name: str) -> bool:
    return any(m["id"] == model_name for m in TEXT_PRIMARY_MODELS)


def is_primary_text_model(model_name: str) -> bool:
    """Gemini, OpenAI, or Claude catalog entries (not Pollinations)."""
    return is_catalog_text_model(model_name) and not is_pollinations_model(model_name)


def is_selectable_text_model(model_name: str) -> bool:
    """Primary catalog models or Pollinations fallback."""
    if is_pollinations_model(model_name):
        return True
    return is_catalog_text_model(model_name)


def _text_models_for_picker() -> List[Dict[str, Any]]:
    models: List[Dict[str, Any]] = []
    for entry in TEXT_PRIMARY_MODELS:
        models.append(
            {
                **entry,
                "role": "primary",
                "available": model_is_available(entry["id"]),
            }
        )
    fallback_id = _pollinations_fallback_id(Capability.TEXT)
    models.append(
        {
            "id": fallback_id,
            "label": "Pollinations",
            "provider": "pollinations",
            "role": "fallback",
            "available": model_is_available(fallback_id),
        }
    )
    return models


def _primary_env_key(capability: Capability) -> str:
    return f"{capability.value.upper()}_MODEL"


def _fallback_env_key(capability: Capability) -> str:
    return f"{capability.value.upper()}_FALLBACK_MODEL"


def get_primary_model(capability: Capability) -> str:
    default_primary, _ = DEFAULTS[capability]
    key = _primary_env_key(capability)
    raw = os.getenv(key)
    if not raw and capability == Capability.TEXT:
        raw = os.getenv(_LEGACY_TEXT_PRIMARY)
    value = (raw or default_primary).strip()
    if capability == Capability.TEXT and not is_primary_text_model(value):
        return default_primary
    return value


def get_fallback_model(capability: Capability) -> Optional[str]:
    _, default_fallback = DEFAULTS[capability]
    key = _fallback_env_key(capability)
    raw = os.getenv(key)
    if not raw and capability == Capability.TEXT:
        raw = os.getenv(_LEGACY_TEXT_FALLBACK)
    value = (raw or default_fallback or _pollinations_fallback_id(capability)).strip()
    if not is_pollinations_model(value):
        value = _pollinations_fallback_id(capability)
    return value if model_is_available(value) else None


def model_is_available(model_name: str) -> bool:
    if is_pollinations_model(model_name):
        return bool(_pollinations_api_key())
    if model_name.startswith("gemini/"):
        return bool(os.getenv("GEMINI_API_KEY"))
    if model_name.startswith("claude") or model_name.startswith("anthropic/"):
        return bool(os.getenv("ANTHROPIC_API_KEY"))
    if model_name.startswith("gpt") or model_name.startswith("openai/"):
        return bool(os.getenv("OPENAI_API_KEY"))
    if model_name in ("whisper-1", "tts-1", "dall-e-3"):
        return bool(os.getenv("OPENAI_API_KEY"))
    return False


def sanitize_model_id(model: str, capability: Capability) -> str:
    cleaned = model.strip()
    if capability == Capability.TEXT:
        if not is_selectable_text_model(cleaned):
            replacement = get_primary_model(capability)
            if cleaned != replacement:
                logger.warning(
                    "Text model %s is not in the catalog; using %s",
                    cleaned,
                    replacement,
                )
            return replacement
        if not model_is_available(cleaned):
            replacement = get_primary_model(capability)
            logger.warning(
                "Text model %s unavailable (missing API key); using %s",
                cleaned,
                replacement,
            )
            return replacement
        return cleaned

    if not model_is_available(cleaned):
        return get_primary_model(capability)
    return cleaned


def resolve_models(
    capability: Capability,
    preferred: Optional[str] = None,
) -> List[str]:
    if preferred and preferred.strip():
        primary = sanitize_model_id(preferred, capability)
    else:
        primary = get_primary_model(capability)

    models: List[str] = []
    if model_is_available(primary):
        models.append(primary)

    fallback = get_fallback_model(capability)
    if fallback and fallback not in models:
        models.append(fallback)

    return models


def litellm_kwargs(model_name: str) -> Dict[str, Any]:
    if is_pollinations_model(model_name):
        provider_model = model_name.split("/", 1)[-1]
        return {
            "model": f"openai/{provider_model}",
            "api_base": _pollinations_v1_base(),
            "api_key": _pollinations_api_key(),
            "extra_headers": dict(_POLLINATIONS_HTTP_HEADERS),
        }
    if model_name.startswith("claude") and not model_name.startswith("anthropic/"):
        return {
            "model": model_name,
            "api_key": os.getenv("ANTHROPIC_API_KEY"),
        }
    if model_name in ("whisper-1", "tts-1"):
        return {"model": model_name, "api_key": os.getenv("OPENAI_API_KEY")}
    if model_name == "dall-e-3":
        return {"model": "dall-e-3", "api_key": os.getenv("OPENAI_API_KEY")}
    return {"model": model_name}


def pollinations_model_id(model_name: str) -> str:
    if model_name.startswith("pollinations/"):
        return model_name.split("/", 1)[-1]
    return model_name


def get_models_catalog() -> Dict[str, Any]:
    capabilities: Dict[str, Any] = {}
    for cap in Capability:
        if cap == Capability.TEXT:
            picker_models = _text_models_for_picker()
        else:
            picker_models = [
                {**m, "available": model_is_available(m["id"])}
                for m in MODEL_CATALOG[cap]
            ]
        chain = resolve_models(cap)
        fallback = get_fallback_model(cap)
        capabilities[cap.value] = {
            "label": cap.value.replace("_", " ").title(),
            "primary": get_primary_model(cap),
            "fallback": fallback,
            "chain": chain,
            "models": picker_models,
        }
    text_info = capabilities["text"]
    return {
        "capabilities": capabilities,
        "text": text_info,
        "primary": get_primary_model(Capability.TEXT),
        "fallback": get_fallback_model(Capability.TEXT),
        "models": text_info["models"],
    }


def log_startup_summary() -> None:
    for cap in Capability:
        chain = resolve_models(cap)
        logger.info("[%s] model chain: %s", cap.value, " -> ".join(chain) or "(none)")
