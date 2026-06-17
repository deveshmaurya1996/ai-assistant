
from __future__ import annotations

import io
import os
import wave
from pathlib import Path


def voice_gateway_pcm_sample_rate() -> int:
    raw = os.getenv("VOICE_GATEWAY_PCM_SAMPLE_RATE", "48000").strip()
    try:
        rate = int(raw)
    except ValueError:
        rate = 48_000
    return rate if rate > 0 else 48_000


def is_raw_pcm_filename(filename: str) -> bool:
    return Path(filename).suffix.lower() in {".raw", ".pcm"}


def pcm_s16le_to_wav_bytes(
    pcm: bytes,
    *,
    sample_rate: int | None = None,
    channels: int = 1,
) -> bytes:
    if not pcm:
        return b""
    rate = sample_rate if sample_rate and sample_rate > 0 else voice_gateway_pcm_sample_rate()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()
