#!/usr/bin/env python3
"""Smoke-test NVIDIA integrate + ai.api endpoints. Reads NVIDIA_API_KEY from env only."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx", file=sys.stderr)
    sys.exit(1)

INTEGRATE = "https://integrate.api.nvidia.com/v1"
RERANK_URL = "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking"

EXPECTED_CHAT = {
    "deepseek-ai/deepseek-v4-flash",
    "z-ai/glm-5.1",
    "qwen/qwen3-next-80b-a3b-instruct",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "meta/llama-4-maverick-17b-128e-instruct",
    "moonshotai/kimi-k2.6",
    "nvidia/nemotron-3.5-content-safety",
    "nvidia/nv-embed-v1",
}

EXPECTED_EMBED_MODEL = "nvidia/nv-embed-v1"
EXPECTED_RERANK_MODEL = "nv-rerank-qa-mistral-4b:1"


def _key() -> str:
    key = os.getenv("NVIDIA_API_KEY", "").strip()
    if not key:
        print("FAIL: NVIDIA_API_KEY is not set", file=sys.stderr)
        sys.exit(1)
    return key


def _headers(key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def check_models_list(client: httpx.Client, key: str) -> bool:
    print("GET /v1/models …")
    response = client.get(f"{INTEGRATE}/models", headers=_headers(key))
    if response.status_code >= 400:
        print(f"  FAIL HTTP {response.status_code}: {response.text[:300]}")
        return False

    data = response.json()
    ids = {m.get("id") for m in data.get("data", []) if isinstance(m, dict)}
    missing = sorted(EXPECTED_CHAT - ids)
    found = sorted(EXPECTED_CHAT & ids)
    print(f"  found {len(found)}/{len(EXPECTED_CHAT)} expected chat/embed IDs")
    for mid in found:
        print(f"    ✓ {mid}")
    if missing:
        print("  missing (may still work via direct call):")
        for mid in missing:
            print(f"    ? {mid}")
    return True


def check_embed(client: httpx.Client, key: str) -> bool:
    print("POST /v1/embeddings …")
    payload = {
        "input": ["verify script probe"],
        "model": EXPECTED_EMBED_MODEL,
        "encoding_format": "float",
        "input_type": "query",
        "truncate": "NONE",
    }
    response = client.post(
        f"{INTEGRATE}/embeddings",
        headers=_headers(key),
        json=payload,
    )
    if response.status_code >= 400:
        print(f"  FAIL HTTP {response.status_code}: {response.text[:300]}")
        return False

    data = response.json()
    rows = data.get("data") or []
    if not rows or not rows[0].get("embedding"):
        print("  FAIL: empty embedding")
        return False
    dim = len(rows[0]["embedding"])
    print(f"  OK embedding dim={dim}")
    return True


def check_rerank(client: httpx.Client, key: str) -> bool:
    print("POST ai.api reranking …")
    payload = {
        "model": EXPECTED_RERANK_MODEL,
        "query": {"text": "What is RAG?"},
        "passages": [{"text": "RAG combines retrieval with generation."}],
    }
    response = client.post(RERANK_URL, headers=_headers(key), json=payload)
    if response.status_code >= 400:
        print(f"  FAIL HTTP {response.status_code}: {response.text[:300]}")
        return False
    print(f"  OK {json.dumps(response.json())[:120]}…")
    return True


def check_chat_mini(client: httpx.Client, key: str) -> bool:
    print("POST /v1/chat/completions (nemotron-mini) …")
    payload = {
        "model": "nvidia/nemotron-mini-4b-instruct",
        "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
        "max_tokens": 16,
        "temperature": 0.2,
        "stream": False,
    }
    response = client.post(
        f"{INTEGRATE}/chat/completions",
        headers=_headers(key),
        json=payload,
        timeout=60.0,
    )
    if response.status_code >= 400:
        print(f"  FAIL HTTP {response.status_code}: {response.text[:300]}")
        return False
    text = (
        response.json()
        .get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    print(f"  OK reply={text!r:.80}")
    return True


def main() -> int:
    key = _key()
    print("NVIDIA model verification (no keys logged)\n")

    ok = True
    with httpx.Client(timeout=90.0) as client:
        for fn in (check_models_list, check_embed, check_rerank, check_chat_mini):
            try:
                if not fn(client, key):
                    ok = False
            except Exception as exc:
                print(f"  FAIL {exc}")
                ok = False
            print()

    repo = Path(__file__).resolve().parents[1]
    yaml_path = repo / "planner-config" / "ai-models.yaml"
    if yaml_path.is_file():
        print(f"Config: {yaml_path}")
    else:
        print(f"WARN: missing {yaml_path}")

    if ok:
        print("All checks passed.")
        return 0
    print("Some checks failed.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
