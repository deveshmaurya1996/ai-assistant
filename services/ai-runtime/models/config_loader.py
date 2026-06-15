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

    data = _read_yaml_file(path)
    root = path.parent
    extra = os.getenv("AI_MODELS_CONFIG_EXTRA", "").strip()
    extras = [p.strip() for p in extra.split(",") if p.strip()] if extra else []
    if not extras:
        extras = [
            "vision-models.yaml",
            "voice-models.yaml",
            "rag-models.yaml",
            "safety-models.yaml",
        ]
    for name in extras:
        sibling = root / name
        if sibling.is_file():
            _merge_catalog_file(data, _read_yaml_file(sibling))

    if not isinstance(data, dict):
        raise AIModelsConfigError(
            f"AI models config must be a mapping, got {type(data).__name__}"
        )

    _config_cache = data
    return _config_cache


def _read_yaml_file(path: Path) -> Dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    try:
        import yaml

        loaded = yaml.safe_load(raw) or {}
    except ImportError:
        if raw.strip().startswith("{"):
            loaded = json.loads(raw)
        else:
            raise AIModelsConfigError(
                f"AI models config requires PyYAML to parse {path}"
            ) from None
    except Exception as exc:
        raise AIModelsConfigError(
            f"Failed to parse AI models config {path}: {exc}"
        ) from exc
    return loaded if isinstance(loaded, dict) else {}


def _merge_catalog_file(base: Dict[str, Any], extra: Dict[str, Any]) -> None:
    for key in ("models",):
        items = extra.get(key) or []
        if items:
            base.setdefault(key, [])
            existing_ids = {str(m.get("id")) for m in base[key] if isinstance(m, dict)}
            for item in items:
                if not isinstance(item, dict):
                    continue
                mid = str(item.get("id") or "")
                if mid and mid not in existing_ids:
                    base[key].append(item)
                    existing_ids.add(mid)


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


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if raw in ("1", "true", "yes"):
        return True
    if raw in ("0", "false", "no"):
        return False
    return default


def get_rag_config() -> Dict[str, Any]:
    cfg = load_ai_models_config()
    rag = cfg.get("rag") or {}
    return {
        "enabledByDefault": bool(rag.get("enabledByDefault", False)),
        "minScore": float(rag.get("minScore", 0.35)),
        "timeoutSeconds": float(rag.get("timeoutSeconds", 5)),
        "limit": int(rag.get("limit", 3)),
        "factLimit": int(rag.get("factLimit", 5)),
        "warmEmbedderOnStartup": _env_bool(
            "WARM_EMBEDDER_ON_STARTUP",
            bool(rag.get("warmEmbedderOnStartup", True)),
        ),
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
        "probeTimeoutSeconds": float(racing.get("probeTimeoutSeconds", 8)),
        "adaptiveEnabled": bool(racing.get("adaptiveEnabled", True)),
        "raceHealthThreshold": float(racing.get("raceHealthThreshold", 0.9)),
        "raceMinSamples": int(racing.get("raceMinSamples", 5)),
    }


def get_task_profile(task: str) -> Dict[str, Any]:
    cfg = load_ai_models_config()
    profiles = cfg.get("taskProfiles") or {}
    entry = profiles.get(task) or profiles.get("fast_chat") or {}
    return dict(entry) if isinstance(entry, dict) else {}


def get_speed_profile(speed_profile: str) -> Dict[str, Any]:
    cfg = load_ai_models_config()
    profiles = cfg.get("speedProfiles") or {}
    entry = profiles.get(speed_profile) or {}
    return dict(entry) if isinstance(entry, dict) else {}


def context_window_for_task(task: str) -> int:
    tiers = routing_tiers_for_task(task)
    primary = (tiers.get("tier1") or [None])[0]
    if primary:
        entry = model_def(primary) or {}
        window = entry.get("contextWindow")
        if window is not None:
            return int(window)
    return 32_000


def probe_timeout_for_task(task: str, speed_profile: str | None = None) -> float:
    profile = dict(get_task_profile(task))
    if speed_profile:
        sp = get_speed_profile(speed_profile)
        raw_sp = sp.get("probeTimeoutSeconds")
        if raw_sp is not None:
            profile["probeTimeoutSeconds"] = raw_sp
    orch = get_orchestration_config()
    raw = profile.get("probeTimeoutSeconds")
    if raw is not None:
        return float(raw)
    return float(orch.get("probeTimeoutSeconds", 8))


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


def get_health_monitor_config() -> Dict[str, Any]:
    cfg = load_ai_models_config()
    hm = cfg.get("healthMonitor") or {}
    probe_tiers = hm.get("probeTiers") or {}
    return {
        "probeMaxTokens": int(hm.get("probeMaxTokens", 2)),
        "probeConcurrency": int(hm.get("probeConcurrency", 5)),
        "probeTiers": {
            "critical": int(probe_tiers.get("critical", 300)),
            "fallback": int(probe_tiers.get("fallback", 900)),
        },
        "warmupSuccessThreshold": int(hm.get("warmupSuccessThreshold", 3)),
        "degradedLatencyMultiplier": float(hm.get("degradedLatencyMultiplier", 3)),
        "degradedSuccessRateThreshold": float(hm.get("degradedSuccessRateThreshold", 0.95)),
        "requestTelemetryWindowSeconds": int(hm.get("requestTelemetryWindowSeconds", 3600)),
        "requestTelemetryWeight": float(hm.get("requestTelemetryWeight", 0.7)),
        "scoreTieEpsilon": float(hm.get("scoreTieEpsilon", 0.05)),
        "minSampleCountForRanking": int(hm.get("minSampleCountForRanking", 50)),
        "confidenceFullSampleCount": int(hm.get("confidenceFullSampleCount", 500)),
        "circuitConsecutiveFailures": int(hm.get("circuitConsecutiveFailures", 5)),
        "circuitOpenSeconds": int(hm.get("circuitOpenSeconds", 300)),
        "providerCircuitOpenSeconds": int(hm.get("providerCircuitOpenSeconds", 600)),
        "rankingStabilitySeconds": int(hm.get("rankingStabilitySeconds", 1800)),
        "rankingImprovementRatio": float(hm.get("rankingImprovementRatio", 0.20)),
        "promotionCooldownSeconds": int(hm.get("promotionCooldownSeconds", 3600)),
    }


def _model_entry(model_id: str) -> Dict[str, Any]:
    return dict(model_def(model_id) or {})


def router_eligible(model_id: str) -> bool:
    entry = _model_entry(model_id)
    return bool(entry.get("routerEligible", False))


_CHAT_PICKER_TASKS = frozenset(
    {
        "fast_chat",
        "reasoning",
        "coding",
        "planner",
        "summary",
        "vision",
        "file_analysis",
        "attachment_read",
    }
)
_INTERNAL_ONLY_ADAPTERS = frozenset(
    {"nvidia_embed", "nvidia_rerank", "magpie_tts", "multimodal_stt"}
)
_INTERNAL_ONLY_TASKS = frozenset(
    {"embedding", "rerank", "safety", "speech", "transcription", "image", "image_edit"}
)


def user_selectable(model_id: str) -> bool:
    """Models shown in the user-facing model picker (beyond router pilot set)."""
    entry = _model_entry(model_id)
    if not entry:
        return False
    ui = get_model_ui(model_id)
    if ui.get("selectable") or entry.get("routerEligible"):
        return True
    role = str(entry.get("runtimeRole") or "")
    if role in ("llm", "vision"):
        return True
    tasks = set(entry.get("tasks") or [])
    if not tasks or tasks <= _INTERNAL_ONLY_TASKS:
        return False
    adapter = str(entry.get("adapter") or "")
    if adapter in _INTERNAL_ONLY_ADAPTERS:
        return False
    return bool(tasks & _CHAT_PICKER_TASKS)


def runtime_router_model_ids() -> List[str]:
    ids: List[str] = []
    for entry in list_model_defs():
        mid = str(entry.get("id") or "")
        if mid and router_eligible(mid):
            ids.append(mid)
    return ids


def get_model_probe_tier(model_id: str) -> Optional[str]:
    entry = _model_entry(model_id)
    tier = entry.get("probeTier")
    return str(tier) if tier else None


def models_for_probe_tier(tier: str) -> List[str]:
    return [
        mid
        for mid in runtime_router_model_ids()
        if get_model_probe_tier(mid) == tier
    ]


def get_model_capabilities(model_id: str) -> Dict[str, Any]:
    entry = _model_entry(model_id)
    caps = entry.get("capabilities") or {}
    if isinstance(caps, dict) and caps:
        return dict(caps)
    role = str(entry.get("runtimeRole") or "")
    tasks = set(entry.get("tasks") or [])
    return {
        "chat": "fast_chat" in tasks or role == "llm",
        "coding": "coding" in tasks or role == "llm",
        "reasoning": "reasoning" in tasks or role == "llm",
        "vision": "vision" in tasks or role == "vision",
        "toolCalling": True,
        "jsonMode": True,
        "streaming": True,
    }


def get_model_ui(model_id: str) -> Dict[str, Any]:
    entry = _model_entry(model_id)
    ui = entry.get("ui") or {}
    if isinstance(ui, dict):
        return dict(ui)
    return {"selectable": router_eligible(model_id), "featured": False}


def get_model_cost_class(model_id: str) -> str:
    entry = _model_entry(model_id)
    return str(entry.get("costClass") or "medium")


def load_merged_catalog() -> Dict[str, Any]:
    return load_ai_models_config()

