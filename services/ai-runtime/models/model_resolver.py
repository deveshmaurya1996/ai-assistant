from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from models.config_loader import (
    get_rag_config,
    get_timeouts,
    list_model_defs,
    load_ai_models_config,
    model_def,
    routing_for_task,
    timeout_for_model,
)

logger = logging.getLogger(__name__)

_POLLINATIONS_HEADERS = {"User-Agent": "Ai-Assistant/1.0"}


def _provider_cfg(provider: str) -> Dict[str, Any]:
    cfg = load_ai_models_config()
    return dict((cfg.get("providers") or {}).get(provider) or {})


def _api_key(env_name: str) -> Optional[str]:
    return os.getenv(env_name) or None


def _infer_provider(model_id: str, entry: Optional[Dict[str, Any]]) -> str:
    if entry and entry.get("provider"):
        return str(entry["provider"])
    if model_id.startswith("pollinations/"):
        return "pollinations"
    if model_id.startswith("groq/"):
        return "groq"
    if model_id.startswith("nvidia/") or model_id.startswith("google/"):
        return "nvidia"
    return ""


def provider_for_model(model_id: str) -> str:
    return _infer_provider(model_id, model_def(model_id))


def model_is_available(model_id: str) -> bool:
    entry = model_def(model_id)
    if not entry:
        if model_id.startswith("pollinations/"):
            return bool(_api_key("POLLINATIONS_API_KEY"))
        if model_id.startswith("groq/"):
            return bool(_api_key("GROQ_API_KEY"))
        if model_id.startswith("nvidia/") or model_id.startswith("google/"):
            return bool(_api_key("NVIDIA_API_KEY"))
        return False

    adapter = str(entry.get("adapter") or "")
    if adapter in ("nvidia_embed", "nvidia_rerank", "multimodal_stt", "nvidia_vlm"):
        return bool(_api_key("NVIDIA_API_KEY"))
    if adapter == "magpie_tts":
        return bool(_api_key("NVIDIA_API_KEY")) and bool(
            os.getenv("NVIDIA_MAGPIE_TTS_HTTP_URL", "").strip()
        )

    provider = _infer_provider(model_id, entry)
    prov = _provider_cfg(provider)
    env_name = prov.get("apiKeyEnv")
    return bool(_api_key(env_name)) if env_name else False


def label_for(model_id: str) -> str:
    entry = model_def(model_id)
    if entry and entry.get("label"):
        return str(entry["label"])
    return model_id.split("/")[-1]


_VISION_FALLBACK_TASKS = frozenset({"vision", "file_analysis"})


def resolve_chain(task: str) -> List[str]:
    from models.orchestration.circuit_breaker import circuit_breaker

    candidates = routing_for_task(task)
    available = [
        m
        for m in candidates
        if model_is_available(m)
        and not circuit_breaker.is_open(provider_for_model(m), task="*")
    ]
    if task in _VISION_FALLBACK_TASKS:
        for model_id in routing_for_task("fallback"):
            if model_is_available(model_id) and model_id not in available:
                available.append(model_id)
    if available:
        return available
    return [m for m in routing_for_task("fallback") if model_is_available(m)]


def _litellm_default_params(entry: Dict[str, Any]) -> Dict[str, Any]:
    raw = entry.get("defaultParams") or {}
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, Any] = {}
    for key in (
        "temperature",
        "top_p",
        "max_tokens",
        "max_completion_tokens",
        "frequency_penalty",
        "presence_penalty",
    ):
        if raw.get(key) is not None:
            out[key] = raw[key]
    extra = raw.get("extra_body")
    if isinstance(extra, dict) and extra:
        out["extra_body"] = extra
    return out


def litellm_kwargs(
    model_id: str,
    *,
    stream: bool = True,
    task: Optional[str] = None,
    allow_thinking: Optional[bool] = None,
    speed_profile: Optional[str] = None,
) -> Dict[str, Any]:
    from models.orchestration.param_policy import apply_task_policy

    timeout = timeout_for_model(model_id, stream=stream)
    entry = model_def(model_id) or {}
    provider = _infer_provider(model_id, entry)
    prov = _provider_cfg(provider)
    kind = str(prov.get("kind", ""))

    kwargs: Dict[str, Any] = {
        "timeout": timeout,
        "request_timeout": timeout,
    }
    kwargs.update(_litellm_default_params(entry))

    if kind == "pollinations" or provider == "pollinations" or model_id.startswith(
        "pollinations/"
    ):
        prov = _provider_cfg("pollinations")
        provider_model = entry.get("providerModel") or model_id.split("/", 1)[-1]
        base = str(prov.get("baseUrl", "https://gen.pollinations.ai/v1")).rstrip("/")
        headers = dict(prov.get("headers") or _POLLINATIONS_HEADERS)
        kwargs.update(
            {
                "model": f"openai/{provider_model}",
                "api_base": base if base.endswith("/v1") else f"{base}/v1",
                "api_key": _api_key(prov.get("apiKeyEnv", "POLLINATIONS_API_KEY")),
                "extra_headers": headers,
            }
        )
        return apply_task_policy(
            kwargs, task, allow_thinking=allow_thinking, speed_profile=speed_profile
        )

    if kind == "groq" or provider == "groq" or model_id.startswith("groq/"):
        prov = _provider_cfg("groq")
        provider_model = entry.get("providerModel") or model_id.split("/", 1)[-1]
        base = str(prov.get("baseUrl", "https://api.groq.com/openai/v1")).rstrip("/")
        kwargs.update(
            {
                "model": f"openai/{provider_model}",
                "api_base": base if base.endswith("/v1") else f"{base}/v1",
                "api_key": _api_key(prov.get("apiKeyEnv", "GROQ_API_KEY")),
            }
        )
        return apply_task_policy(
            kwargs, task, allow_thinking=allow_thinking, speed_profile=speed_profile
        )

    if kind == "openai_compatible" or provider == "nvidia" or model_id.startswith(
        ("nvidia/", "google/", "meta/", "mistralai/", "z-ai/", "qwen/", "microsoft/")
    ):
        if not provider:
            provider = "nvidia"
        prov = _provider_cfg(provider)
        provider_model = entry.get("providerModel") or model_id.split("/", 1)[-1]
        base = str(
            prov.get("baseUrl", "https://integrate.api.nvidia.com/v1")
        ).rstrip("/")
        kwargs.update(
            {
                "model": f"openai/{provider_model}",
                "api_base": base if base.endswith("/v1") else f"{base}/v1",
                "api_key": _api_key(prov.get("apiKeyEnv", "NVIDIA_API_KEY")),
            }
        )
        return apply_task_policy(
            kwargs, task, allow_thinking=allow_thinking, speed_profile=speed_profile
        )

    kwargs["model"] = model_id
    return apply_task_policy(
            kwargs, task, allow_thinking=allow_thinking, speed_profile=speed_profile
        )


def pollinations_api_key() -> str:
    prov = _provider_cfg("pollinations")
    return _api_key(prov.get("apiKeyEnv", "POLLINATIONS_API_KEY")) or ""


def pollinations_base_url() -> str:
    prov = _provider_cfg("pollinations")
    base = str(prov.get("baseUrl", "https://gen.pollinations.ai/v1")).rstrip("/")
    if base.endswith("/v1"):
        return base[: -len("/v1")]
    return base


_pollinations_api_key = pollinations_api_key
_pollinations_base_url = pollinations_base_url


def get_models_catalog() -> Dict[str, Any]:
    models = []
    for entry in list_model_defs():
        mid = str(entry.get("id", ""))
        models.append(
            {
                "id": mid,
                "label": entry.get("label", mid),
                "provider": entry.get("provider"),
                "tasks": entry.get("tasks") or [],
                "tier": entry.get("tier"),
                "adapter": entry.get("adapter"),
                "available": model_is_available(mid),
            }
        )

    routing = load_ai_models_config().get("routing") or {}
    task_chains = {
        task: resolve_chain(task) for task in routing.keys() if task != "fallback"
    }

    return {
        "mode": "auto",
        "providers": list((load_ai_models_config().get("providers") or {}).keys()),
        "models": models,
        "routing": routing,
        "taskChains": task_chains,
        "rag": get_rag_config(),
        "timeouts": get_timeouts(),
    }


def log_startup_summary() -> None:
    for task, chain in get_models_catalog().get("taskChains", {}).items():
        logger.info("[task:%s] chain: %s", task, " -> ".join(chain) or "(none)")
