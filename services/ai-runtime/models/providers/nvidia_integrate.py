from __future__ import annotations

import os
from typing import Any, Dict

from models.config_loader import load_ai_models_config, model_def


def nvidia_api_key() -> str:
    key = os.getenv("NVIDIA_API_KEY", "").strip()
    if not key:
        raise RuntimeError("NVIDIA_API_KEY is not set")
    return key


def integrate_base_url() -> str:
    cfg = load_ai_models_config()
    prov = (cfg.get("providers") or {}).get("nvidia") or {}
    base = str(prov.get("baseUrl", "https://integrate.api.nvidia.com/v1")).rstrip("/")
    return base if base.endswith("/v1") else f"{base}/v1"


def model_default_params(model_id: str) -> Dict[str, Any]:
    entry = model_def(model_id) or {}
    raw = entry.get("defaultParams") or {}
    return dict(raw) if isinstance(raw, dict) else {}
