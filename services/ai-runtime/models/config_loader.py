from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

_config_cache: Optional[Dict[str, Any]] = None

DEFAULT_CONFIG_RELATIVE = Path("planner-config") / "ai-models.yaml"


class AIModelsConfigError(RuntimeError):
    """Raised when ai-models YAML cannot be loaded."""
    pass


def find_monorepo_root() -> Path:
    current = Path(__file__).resolve().parent
    for parent in [current, *current.parents]:
        if (parent / "pnpm-workspace.yaml").exists():
            return parent
    return Path(__file__).resolve().parents[3]


def config_path() -> Path:
    override = os.getenv("AI_MODELS_CONFIG", "").strip()
    if override:
        path = Path(override)
        return path if path.is_absolute() else find_monorepo_root() / path
    return find_monorepo_root() / DEFAULT_CONFIG_RELATIVE


def load_ai_models_config(*, reload: bool = False) -> Dict[str, Any]:
    global _config_cache
    if _config_cache is not None and not reload:
        return _config_cache

    path = config_path()
    if not path.is_file():
        raise AIModelsConfigError(
            f"AI models config not found: {path} "
            f"(set AI_MODELS_CONFIG or add {DEFAULT_CONFIG_RELATIVE.as_posix()} under repo root)"
        )

    raw = path.read_text(encoding="utf-8")
    try:
        import yaml

        data = yaml.safe_load(raw) or {}
    except ImportError:
        if raw.strip().startswith("{"):
            data = json.loads(raw)
        else:
            raise AIModelsConfigError(
                f"AI models config requires PyYAML to parse {path}"
            ) from None
    except Exception as exc:
        raise AIModelsConfigError(
            f"Failed to parse AI models config {path}: {exc}"
        ) from exc

    if not isinstance(data, dict):
        raise AIModelsConfigError(
            f"AI models config must be a mapping, got {type(data).__name__}"
        )

    _config_cache = data
    return _config_cache


def get_timeouts() -> Dict[str, float]:
    cfg = load_ai_models_config()
    raw = cfg.get("timeouts") or {}
    return {
        "stream": float(raw.get("stream", 45)),
        "complete": float(raw.get("complete", 20)),
        "planner": float(raw.get("planner", 20)),
    }


def timeout_for_model(model_id: str, *, stream: bool) -> float:
    defaults = get_timeouts()
    key = "streamTimeout" if stream else "completeTimeout"
    fallback = defaults["stream"] if stream else defaults["complete"]

    entry = model_def(model_id) or {}
    if entry.get(key) is not None:
        return float(entry[key])

    provider = str(entry.get("provider", ""))
    if not provider:
        if model_id.startswith("nvidia/"):
            provider = "nvidia"
        elif model_id.startswith("groq/"):
            provider = "groq"
        elif model_id.startswith("pollinations/"):
            provider = "pollinations"

    if provider:
        prov = (load_ai_models_config().get("providers") or {}).get(provider) or {}
        if prov.get(key) is not None:
            return float(prov[key])

    return fallback


def get_rag_config() -> Dict[str, Any]:
    cfg = load_ai_models_config()
    rag = cfg.get("rag") or {}
    return {
        "enabledByDefault": bool(rag.get("enabledByDefault", False)),
        "minScore": float(rag.get("minScore", 0.35)),
        "timeoutSeconds": float(rag.get("timeoutSeconds", 5)),
        "limit": int(rag.get("limit", 3)),
        "factLimit": int(rag.get("factLimit", 5)),
        "warmEmbedderOnStartup": bool(rag.get("warmEmbedderOnStartup", True)),
        "embeddingModel": str(rag.get("embeddingModel", "nvidia/nv-embed-v1")),
        "providerModel": str(rag.get("providerModel", "nvidia/nv-embed-v1")),
        "rerankModel": str(rag.get("rerankModel", "nvidia/rerank-qa-mistral-4b")),
        "rerankProviderModel": str(
            rag.get("rerankProviderModel", "nv-rerank-qa-mistral-4b:1")
        ),
        "rerankProvider": str(rag.get("rerankProvider", "nvidia_rerank")),
        "collectionName": str(rag.get("collectionName", "kb_documents_nv")),
        "embeddingDim": int(rag.get("embeddingDim", 4096)),
        "rerankFetchLimit": int(rag.get("rerankFetchLimit", 12)),
        "rerankEnabled": bool(rag.get("rerankEnabled", False)),
        "preStreamBudgetMs": int(rag.get("preStreamBudgetMs", 300)),
        "embeddingCacheTtlSeconds": int(rag.get("embeddingCacheTtlSeconds", 60)),
        "embeddingCacheMaxEntries": int(rag.get("embeddingCacheMaxEntries", 256)),
        "searchTimeoutSeconds": float(
            rag.get("searchTimeoutSeconds", rag.get("timeoutSeconds", 5))
        ),
        "ingestTimeoutSeconds": float(rag.get("ingestTimeoutSeconds", 30)),
    }


def list_model_defs() -> List[Dict[str, Any]]:
    return list(load_ai_models_config().get("models") or [])


def model_def(model_id: str) -> Optional[Dict[str, Any]]:
    for entry in list_model_defs():
        if entry.get("id") == model_id:
            return entry
    return None


def routing_for_task(task: str) -> List[str]:
    cfg = load_ai_models_config()
    routing = cfg.get("routing") or {}
    chain = routing.get(task) or routing.get("fallback") or []
    return [str(m) for m in chain]


def get_orchestration_config() -> Dict[str, Any]:
    cfg = load_ai_models_config()
    orch = cfg.get("orchestration") or {}
    breaker = orch.get("circuitBreaker") or {}
    racing = orch.get("racing") or {}
    return {
        "windowSize": int(breaker.get("windowSize", 50)),
        "failureRateThreshold": float(breaker.get("failureRateThreshold", 0.5)),
        "minSamplesToOpen": int(breaker.get("minSamplesToOpen", 10)),
        "openDurationSeconds": int(breaker.get("openDurationSeconds", 600)),
        "maxConcurrentPerTier": int(racing.get("maxConcurrentPerTier", 2)),
    }


def routing_tiers_for_task(task: str) -> Dict[str, List[str]]:
    cfg = load_ai_models_config()
    tiers_cfg = cfg.get("routingTiers") or {}
    entry = tiers_cfg.get(task) or tiers_cfg.get("fast_chat") or {}
    flat = routing_for_task(task)
    result: Dict[str, List[str]] = {
        "tier1": [str(m) for m in entry.get("tier1") or []],
        "tier2": [str(m) for m in entry.get("tier2") or []],
        "tier3": [str(m) for m in entry.get("tier3") or flat],
    }
    if not result["tier1"] and flat:
        nvidia_models = [m for m in flat if m.startswith("nvidia/")]
        groq_t1 = [m for m in flat if m.startswith("groq/") and "8b" not in m and "20b" not in m]
        groq_t2 = [m for m in flat if m.startswith("groq/") and ("8b" in m or "20b" in m)]
        result["tier1"] = (nvidia_models[:1] + groq_t1[:1])[:2]
        result["tier2"] = groq_t2[:2]
        result["tier3"] = [
            m for m in flat if m not in result["tier1"] and m not in result["tier2"]
        ]
    return result
