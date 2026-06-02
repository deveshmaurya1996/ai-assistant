
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

try:
    import httpx
    import yaml
except ImportError:
    print("pip install httpx pyyaml", file=sys.stderr)
    sys.exit(1)

REPO = Path(__file__).resolve().parents[1]
INTEGRATE = "https://integrate.api.nvidia.com/v1"
RERANK_URL = "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking"
POLL_BASE = "https://gen.pollinations.ai/v1"


def load_dotenv() -> None:
    env_path = REPO / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def load_config() -> dict:
    path = REPO / "config" / "ai-models.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def nvidia_key() -> str | None:
    k = os.getenv("NVIDIA_API_KEY", "").strip()
    return k or None


def poll_key() -> str | None:
    k = os.getenv("POLLINATIONS_API_KEY", "").strip()
    return k or None


def probe_nvidia_chat(client: httpx.Client, provider_model: str) -> tuple[str, str]:
    key = nvidia_key()
    if not key:
        return "skip", "NVIDIA_API_KEY not set"
    payload = {
        "model": provider_model,
        "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
        "max_tokens": 8,
        "temperature": 0.2,
        "stream": False,
    }
    try:
        r = client.post(
            f"{INTEGRATE}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=90.0,
        )
        if r.status_code >= 400:
            return "fail", f"HTTP {r.status_code}: {r.text[:120]}"
        content = (
            r.json().get("choices", [{}])[0].get("message", {}).get("content", "") or ""
        )
        return "ok", content[:40].replace("\n", " ")
    except Exception as exc:
        return "fail", str(exc)[:120]


def probe_nvidia_embed(client: httpx.Client, provider_model: str) -> tuple[str, str]:
    key = nvidia_key()
    if not key:
        return "skip", "NVIDIA_API_KEY not set"
    payload = {
        "input": ["probe"],
        "model": provider_model,
        "encoding_format": "float",
        "input_type": "query",
        "truncate": "NONE",
    }
    try:
        r = client.post(
            f"{INTEGRATE}/embeddings",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=60.0,
        )
        if r.status_code >= 400:
            return "fail", f"HTTP {r.status_code}: {r.text[:120]}"
        emb = (r.json().get("data") or [{}])[0].get("embedding") or []
        return "ok", f"dim={len(emb)}"
    except Exception as exc:
        return "fail", str(exc)[:120]


def probe_nvidia_rerank(client: httpx.Client, provider_model: str) -> tuple[str, str]:
    key = nvidia_key()
    if not key:
        return "skip", "NVIDIA_API_KEY not set"
    payload = {
        "model": provider_model,
        "query": {"text": "test"},
        "passages": [{"text": "test passage"}],
    }
    try:
        r = client.post(
            RERANK_URL,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=60.0,
        )
        if r.status_code >= 400:
            return "fail", f"HTTP {r.status_code}: {r.text[:120]}"
        return "ok", "rankings returned"
    except Exception as exc:
        return "fail", str(exc)[:120]


def probe_pollinations_chat(client: httpx.Client, provider_model: str) -> tuple[str, str]:
    key = poll_key()
    if not key:
        return "skip", "POLLINATIONS_API_KEY not set"
    payload = {
        "model": provider_model,
        "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
        "max_tokens": 8,
        "stream": False,
    }
    try:
        r = client.post(
            f"{POLL_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "User-Agent": "Ai-Assistant/1.0",
            },
            json=payload,
            timeout=90.0,
        )
        if r.status_code >= 400:
            return "fail", f"HTTP {r.status_code}: {r.text[:120]}"
        content = (
            r.json().get("choices", [{}])[0].get("message", {}).get("content", "") or ""
        )
        return "ok", content[:40].replace("\n", " ")
    except Exception as exc:
        return "fail", str(exc)[:120]


def probe_pollinations_get(path: str, label: str) -> tuple[str, str]:
    key = poll_key()
    if not key:
        return "skip", "POLLINATIONS_API_KEY not set"
    url = f"{POLL_BASE}{path}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {key}", "User-Agent": "Ai-Assistant/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = resp.read(256)
            return "ok", f"{label} {len(body)} bytes"
    except Exception as exc:
        return "fail", str(exc)[:120]


def probe_magpie() -> tuple[str, str]:
    if not nvidia_key():
        return "skip", "NVIDIA_API_KEY not set"
    base = os.getenv("NVIDIA_MAGPIE_TTS_HTTP_URL", "").strip()
    if not base:
        return "skip", "NVIDIA_MAGPIE_TTS_HTTP_URL not set"
    return "config", "endpoint configured (not smoke-tested)"


def probe_multimodal_stt(model_id: str, provider_model: str, client: httpx.Client) -> tuple[str, str]:
    """STT adapters also accept chat on integrate for many NVIDIA multimodal models."""
    status, detail = probe_nvidia_chat(client, provider_model)
    if status == "ok":
        return status, f"chat probe: {detail}"
    return status, f"chat/STT path: {detail}"


def main() -> int:
    load_dotenv()
    cfg = load_config()
    models = cfg.get("models") or []

    print("LLM API probe (config/ai-models.yaml)\n")
    print(f"NVIDIA_API_KEY: {'set' if nvidia_key() else 'MISSING'}")
    print(f"POLLINATIONS_API_KEY: {'set' if poll_key() else 'MISSING'}")
    print(f"NVIDIA_MAGPIE_TTS_HTTP_URL: {'set' if os.getenv('NVIDIA_MAGPIE_TTS_HTTP_URL', '').strip() else 'not set'}")
    print()

    rows: list[tuple[str, str, str, str, str]] = []

    with httpx.Client(timeout=90.0) as client:
        for entry in models:
            mid = str(entry.get("id", ""))
            provider = str(entry.get("provider", ""))
            provider_model = str(entry.get("providerModel", ""))
            adapter = str(entry.get("adapter") or "")
            tasks = ",".join(entry.get("tasks") or [])

            if adapter == "nvidia_embed":
                status, detail = probe_nvidia_embed(client, provider_model)
            elif adapter == "nvidia_rerank":
                status, detail = probe_nvidia_rerank(client, provider_model)
            elif adapter == "magpie_tts":
                status, detail = probe_magpie()
            elif adapter == "multimodal_stt":
                status, detail = probe_multimodal_stt(mid, provider_model, client)
            elif provider == "pollinations":
                pm = provider_model
                if "whisper" in pm:
                    status, detail = probe_pollinations_get(
                        "/audio/transcriptions",
                        "endpoint exists",
                    )
                    if status == "ok":
                        status, detail = "config", "use POST with audio (GET skipped)"
                elif pm == "openai-audio":
                    enc = urllib.parse.quote("hi", safe="")
                    status, detail = probe_pollinations_get(
                        f"/audio/{enc}?voice=nova", "TTS"
                    )
                elif pm == "flux":
                    enc = urllib.parse.quote("a red dot", safe="")
                    status, detail = probe_pollinations_get(
                        f"/image/{enc}?model=flux&width=64&height=64",
                        "image",
                    )
                else:
                    status, detail = probe_pollinations_chat(client, pm)
            elif provider == "nvidia":
                status, detail = probe_nvidia_chat(client, provider_model)
            else:
                status, detail = "skip", f"unknown provider {provider}"

            rows.append((status, mid, provider, adapter or "-", detail))

    ok = fail = skip = 0
    for status, mid, provider, adapter, detail in rows:
        if status == "ok":
            ok += 1
            mark = "OK"
        elif status == "config":
            skip += 1
            mark = "CFG"
        elif status == "skip":
            skip += 1
            mark = "SKIP"
        else:
            fail += 1
            mark = "FAIL"
        print(f"[{mark:4}] {mid}")
        print(f"       provider={provider} adapter={adapter}")
        print(f"       {detail}")
        print()

    print("--- Summary ---")
    print(f"Working: {ok}  Failed: {fail}  Skipped/config-only: {skip}  Total: {len(rows)}")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
