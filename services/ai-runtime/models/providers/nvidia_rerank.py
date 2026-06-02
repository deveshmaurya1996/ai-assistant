from __future__ import annotations

from typing import Any, Dict, List

import httpx

from models.config_loader import get_rag_config, load_ai_models_config


def _rerank_base_url() -> str:
    cfg = load_ai_models_config()
    prov = (cfg.get("providers") or {}).get("nvidia_rerank") or {}
    return str(prov.get("baseUrl", "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking")).rstrip("/")


def _rerank_api_key() -> str:
    from models.providers.nvidia_integrate import nvidia_api_key

    return nvidia_api_key()


def rerank_passages(query: str, passages: List[str]) -> List[int]:
    """Return passage indices sorted by relevance (best first)."""
    if not passages:
        return []

    cfg = get_rag_config()
    model = str(cfg.get("rerankProviderModel") or "nv-rerank-qa-mistral-4b:1")
    url = _rerank_base_url()
    headers = {
        "Authorization": f"Bearer {_rerank_api_key()}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "query": {"text": query},
        "passages": [{"text": p} for p in passages],
    }

    with httpx.Client(timeout=float(cfg.get("timeoutSeconds", 8)) + 20) as client:
        response = client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    rankings = data.get("rankings") or data.get("results") or []
    if isinstance(rankings, list) and rankings:
        scored: List[tuple[int, float]] = []
        for item in rankings:
            if not isinstance(item, dict):
                continue
            idx = item.get("index", item.get("id"))
            if idx is None:
                continue
            score = float(item.get("score", item.get("logit", 0)))
            scored.append((int(idx), score))
        if scored:
            scored.sort(key=lambda pair: pair[1], reverse=True)
            return [idx for idx, _ in scored if 0 <= idx < len(passages)]

    return list(range(len(passages)))
