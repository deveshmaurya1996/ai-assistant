from __future__ import annotations

from typing import List

from models.config_loader import get_rag_config
from models.providers.http_pool import nvidia_sync_client
from models.providers.nvidia_integrate import integrate_base_url, nvidia_api_key


def embed_texts(texts: List[str], *, input_type: str) -> List[List[float]]:
    if not texts:
        return []

    cfg = get_rag_config()
    model = str(cfg.get("providerModel") or "nvidia/nv-embed-v1")
    url = f"{integrate_base_url()}/embeddings"
    headers = {
        "Authorization": f"Bearer {nvidia_api_key()}",
        "Content-Type": "application/json",
    }
    payload = {
        "input": texts,
        "model": model,
        "encoding_format": "float",
        "input_type": input_type,
        "truncate": "NONE",
    }

    timeout = float(cfg.get("searchTimeoutSeconds", cfg.get("timeoutSeconds", 5))) + 10
    client = nvidia_sync_client(timeout)
    response = client.post(url, headers=headers, json=payload, timeout=timeout)
        response.raise_for_status()
        data = response.json()

    rows = data.get("data") or []
    vectors: List[List[float]] = []
    for row in sorted(rows, key=lambda item: int(item.get("index", 0))):
        emb = row.get("embedding")
        if isinstance(emb, list):
            vectors.append([float(x) for x in emb])
    if len(vectors) != len(texts):
        raise RuntimeError(
            f"NV-Embed returned {len(vectors)} vectors for {len(texts)} inputs"
        )
    return vectors
