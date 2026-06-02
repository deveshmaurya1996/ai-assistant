from __future__ import annotations

import base64
import re
import httpx

from models.config_loader import model_def
from models.voice.mime import audio_mime_type
from models.providers.nvidia_integrate import (
    integrate_base_url,
    model_default_params,
    nvidia_api_key,
)

_STT_SYSTEM = (
    "You transcribe user audio. Reply with only the spoken words as plain text. "
    "No quotes, labels, or commentary. "
    "If there is no clear human speech (silence, background noise only, or unintelligible audio), "
    "reply with an empty string and nothing else."
)


def _extract_transcript(content: str) -> str:
    text = (content or "").strip()
    if not text:
        return ""
    text = re.sub(r"^```[a-z]*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```$", "", text)
    return text.strip().strip('"').strip("'")


def _stt_max_tokens(duration_s: float | None, params: dict) -> int:
    base = int(params.get("max_tokens", 512))
    if not duration_s or duration_s <= 0:
        return base
    estimated = int(duration_s * 12) + 128
    return min(4096, max(base, estimated))


def transcribe_audio_file(
    model_id: str, wav_path: str, *, duration_s: float | None = None
) -> str:
    entry = model_def(model_id) or {}
    provider_model = str(entry.get("providerModel") or model_id.split("/", 1)[-1])
    params = model_default_params(model_id)
    if duration_s is None:
        from models.voice.ffmpeg import probe_duration_seconds

        try:
            duration_s = probe_duration_seconds(wav_path)
        except Exception:
            duration_s = None
    request_timeout = min(600.0, max(120.0, (duration_s or 60.0) * 3.0 + 60.0))

    with open(wav_path, "rb") as audio_file:
        b64 = base64.standard_b64encode(audio_file.read()).decode("ascii")

    mime = audio_mime_type(wav_path)
    data_url = f"data:{mime};base64,{b64}"

    messages = [
        {"role": "system", "content": _STT_SYSTEM},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Transcribe this audio.",
                },
                {
                    "type": "input_audio",
                    "input_audio": {"data": b64, "format": mime.split("/")[-1]},
                },
            ],
        },
    ]

    payload: dict = {
        "model": provider_model,
        "messages": messages,
        "stream": False,
        "max_tokens": _stt_max_tokens(duration_s, params),
        "temperature": float(params.get("temperature", 0.1)),
    }
    if params.get("top_p") is not None:
        payload["top_p"] = float(params["top_p"])

    url = f"{integrate_base_url()}/chat/completions"
    headers = {
        "Authorization": f"Bearer {nvidia_api_key()}",
        "Content-Type": "application/json",
    }

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            with httpx.Client(timeout=request_timeout) as client:
                response = client.post(url, headers=headers, json=payload)
                if response.status_code >= 400 and attempt == 0:
                    # Fallback message shape for models that reject input_audio
                    payload["messages"] = [
                        {"role": "system", "content": _STT_SYSTEM},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Transcribe the attached audio."},
                                {
                                    "type": "image_url",
                                    "image_url": {"url": data_url},
                                },
                            ],
                        },
                    ]
                    continue
                response.raise_for_status()
                data = response.json()
            choice = (data.get("choices") or [{}])[0]
            message = choice.get("message") or {}
            text = _extract_transcript(str(message.get("content", "")))
            if text:
                return text
            raise RuntimeError("Empty transcript from multimodal model")
        except Exception as exc:
            last_error = exc
            if attempt == 0:
                continue
            raise

    raise RuntimeError(f"Multimodal STT failed: {last_error}")
