
from __future__ import annotations

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
DEFAULT_CONFIG = REPO / "planner-config" / "ai-models.yaml"
INTEGRATE = "https://integrate.api.nvidia.com/v1"
GROQ = "https://api.groq.com/openai/v1"
RERANK_URL = "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking"
POLL_V1 = "https://gen.pollinations.ai/v1"
POLL_ROOT = "https://gen.pollinations.ai"


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


def resolve_config_path() -> Path:
    override = os.getenv("AI_MODELS_CONFIG", "").strip()
    if override:
        path = Path(override)
        return path if path.is_absolute() else REPO / path
    return DEFAULT_CONFIG


def load_config() -> dict:
    path = resolve_config_path()
    if not path.is_file():
        print(f"FAIL: AI models config not found: {path}", file=sys.stderr)
        sys.exit(1)
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def nvidia_key() -> str | None:
    k = os.getenv("NVIDIA_API_KEY", "").strip()
    return k or None


def groq_key() -> str | None:
    k = os.getenv("GROQ_API_KEY", "").strip()
    return k or None


def poll_key() -> str | None:
    k = os.getenv("POLLINATIONS_API_KEY", "").strip()
    return k or None


def probe_openai_chat(
    client: httpx.Client,
    *,
    base_url: str,
    api_key: str | None,
    provider_model: str,
    extra_headers: dict[str, str] | None = None,
) -> tuple[str, str]:
    if not api_key:
        return "skip", "API key not set"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    payload = {
        "model": provider_model,
        "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
        "max_tokens": 8,
        "temperature": 0.2,
        "stream": False,
    }
    try:
        r = client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers=headers,
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


def probe_nvidia_chat(client: httpx.Client, provider_model: str) -> tuple[str, str]:
    return probe_openai_chat(
        client, base_url=INTEGRATE, api_key=nvidia_key(), provider_model=provider_model
    )


def probe_groq_chat(client: httpx.Client, provider_model: str) -> tuple[str, str]:
    return probe_openai_chat(
        client, base_url=GROQ, api_key=groq_key(), provider_model=provider_model
    )


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


def probe_nvidia_vlm(endpoint_url: str) -> tuple[str, str]:
    key = nvidia_key()
    if not key:
        return "skip", "NVIDIA_API_KEY not set"
    try:
        r = httpx.post(
            endpoint_url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"messages": [{"role": "user", "content": "probe"}]},
            timeout=60.0,
        )
        if r.status_code in (400, 422, 500):
            return "config", f"endpoint reachable HTTP {r.status_code} (needs image via VLM adapter)"
        if r.status_code >= 400:
            return "fail", f"HTTP {r.status_code}: {r.text[:120]}"
        return "ok", f"HTTP {r.status_code}"
    except Exception as exc:
        return "fail", str(exc)[:120]


def probe_pollinations_get(url: str, label: str) -> tuple[str, str]:
    key = poll_key()
    if not key:
        return "skip", "POLLINATIONS_API_KEY not set"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {key}", "User-Agent": "Ai-Assistant/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = resp.read(256)
            return "ok", f"{label} {len(body)} bytes"
    except urllib.error.HTTPError as exc:
        if exc.code in (402, 429):
            return "config", f"HTTP {exc.code} (billing/quota — endpoint exists)"
        return "fail", str(exc)[:120]
    except Exception as exc:
        return "fail", str(exc)[:120]


def probe_magpie() -> tuple[str, str]:
    if not nvidia_key():
        return "skip", "NVIDIA_API_KEY not set"
    base = os.getenv("NVIDIA_MAGPIE_TTS_HTTP_URL", "").strip()
    if not base:
        return "skip", "NVIDIA_MAGPIE_TTS_HTTP_URL not set"
    return "config", "endpoint configured (not smoke-tested)"


def probe_multimodal_stt(provider_model: str, client: httpx.Client) -> tuple[str, str]:
    status, detail = probe_nvidia_chat(client, provider_model)
    if status == "ok":
        return status, f"chat probe: {detail}"
    return status, f"chat/STT path: {detail}"


def main() -> int:
    load_dotenv()
    cfg_path = resolve_config_path()
    cfg = load_config()
    models = cfg.get("models") or []

    print(f"LLM API probe ({cfg_path.relative_to(REPO)})\n")
    print(f"NVIDIA_API_KEY: {'set' if nvidia_key() else 'MISSING'}")
    print(f"GROQ_API_KEY: {'set' if groq_key() else 'MISSING'}")
    print(f"POLLINATIONS_API_KEY: {'set' if poll_key() else 'MISSING'}")
    print(
        f"NVIDIA_MAGPIE_TTS_HTTP_URL: "
        f"{'set' if os.getenv('NVIDIA_MAGPIE_TTS_HTTP_URL', '').strip() else 'not set'}"
    )
    print()

    rows: list[tuple[str, str, str, str, str]] = []

    with httpx.Client(timeout=90.0) as client:
        for entry in models:
            mid = str(entry.get("id", ""))
            provider = str(entry.get("provider", ""))
            provider_model = str(entry.get("providerModel", ""))
            adapter = str(entry.get("adapter") or "")

            if adapter == "nvidia_embed":
                status, detail = probe_nvidia_embed(client, provider_model)
            elif adapter == "nvidia_rerank":
                status, detail = probe_nvidia_rerank(client, provider_model)
            elif adapter == "magpie_tts":
                status, detail = probe_magpie()
            elif adapter == "multimodal_stt":
                status, detail = probe_multimodal_stt(provider_model, client)
            elif adapter == "nvidia_vlm" or provider == "nvidia_vlm":
                ep = entry.get("endpointUrl") or f"https://ai.api.nvidia.com/v1/vlm/{provider_model}"
                status, detail = probe_nvidia_vlm(str(ep))
            elif provider == "groq":
                status, detail = probe_groq_chat(client, provider_model)
            elif provider == "pollinations":
                pm = provider_model
                if "whisper" in pm:
                    status, detail = "config", "needs audio POST (not probed)"
                elif pm == "openai-audio":
                    enc = urllib.parse.quote("hi", safe="")
                    status, detail = probe_pollinations_get(
                        f"{POLL_ROOT}/audio/{enc}?voice=nova",
                        "TTS",
                    )
                elif pm == "flux":
                    enc = urllib.parse.quote("a red dot", safe="")
                    status, detail = probe_pollinations_get(
                        f"{POLL_ROOT}/image/{enc}?model=flux&width=64&height=64",
                        "image",
                    )
                else:
                    status, detail = probe_openai_chat(
                        client,
                        base_url=POLL_V1,
                        api_key=poll_key(),
                        provider_model=pm,
                        extra_headers={"User-Agent": "Ai-Assistant/1.0"},
                    )
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
        elif status in ("config", "skip"):
            skip += 1
            mark = "CFG" if status == "config" else "SKIP"
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
