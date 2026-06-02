from __future__ import annotations

import os
from pathlib import Path

import httpx

from models.config_loader import model_def


def _magpie_http_base() -> str | None:
    raw = os.getenv("NVIDIA_MAGPIE_TTS_HTTP_URL", "").strip().rstrip("/")
    return raw or None


def _default_prompt_path(entry: dict) -> Path | None:
    raw = entry.get("zeroShotPromptPath") or os.getenv(
        "NVIDIA_MAGPIE_PROMPT_PATH",
        "services/ai-runtime/assets/voice/default_magpie_prompt.wav",
    )
    path = Path(str(raw))
    if not path.is_absolute():
        from models.config_loader import find_monorepo_root

        path = find_monorepo_root() / path
    return path if path.is_file() else None


def synthesize_speech(model_id: str, text: str) -> bytes:
    base = _magpie_http_base()
    if not base:
        raise RuntimeError(
            "NVIDIA_MAGPIE_TTS_HTTP_URL is not set — Magpie TTS requires a Speech NIM HTTP endpoint"
        )

    entry = model_def(model_id) or {}
    language = str(entry.get("languageCode") or "en-US")
    prompt_path = _default_prompt_path(entry)
    if not prompt_path:
        raise RuntimeError(
            "Magpie zero-shot requires audio_prompt WAV — set zeroShotPromptPath in ai-models.yaml "
            "or NVIDIA_MAGPIE_PROMPT_PATH"
        )

    from models.providers.nvidia_integrate import nvidia_api_key

    url = f"{base}/v1/audio/synthesize"
    headers = {"Authorization": f"Bearer {nvidia_api_key()}"}
    data = {"language": language, "text": text}
    files = {
        "audio_prompt": (
            prompt_path.name,
            prompt_path.read_bytes(),
            "audio/wav",
        )
    }

    with httpx.Client(timeout=120.0) as client:
        response = client.post(url, headers=headers, data=data, files=files)
        response.raise_for_status()
        return response.content
