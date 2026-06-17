from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Iterator, Optional

from .pcm import is_raw_pcm_filename, voice_gateway_pcm_sample_rate
from .wyoming_stt import transcribe_wyoming_pcm
from .wyoming_tts import synthesize_wyoming_pcm_chunks

logger = logging.getLogger(__name__)

DEFAULT_STT_PROVIDER = "faster-whisper"
DEFAULT_TTS_PROVIDER = "piper"
DEFAULT_FASTER_WHISPER_MODEL = "base.en"
DEFAULT_PIPER_VOICE = "en_US-lessac-medium"
DEFAULT_PCM_SAMPLE_RATE = 24_000

LEGACY_VOICE_ALIASES: dict[str, str] = {
    "female-professional": DEFAULT_PIPER_VOICE,
    "female-friendly": DEFAULT_PIPER_VOICE,
    "male-executive": DEFAULT_PIPER_VOICE,
    "teacher-calm": DEFAULT_PIPER_VOICE,
    "friendly-neutral": DEFAULT_PIPER_VOICE,
    "alloy": DEFAULT_PIPER_VOICE,
    "nova": DEFAULT_PIPER_VOICE,
    "onyx": DEFAULT_PIPER_VOICE,
    "shimmer": DEFAULT_PIPER_VOICE,
    "fable": DEFAULT_PIPER_VOICE,
}


def _piper_voice(voice: Optional[str]) -> str:
    raw = (voice or os.getenv("PIPER_DEFAULT_VOICE", DEFAULT_PIPER_VOICE)).strip()
    return LEGACY_VOICE_ALIASES.get(raw, raw)


def transcribe_audio_bytes(content: bytes, filename: str = "audio.m4a") -> str:
    rate = voice_gateway_pcm_sample_rate()
    width = 2
    channels = 1
    pcm = content

    if is_raw_pcm_filename(filename):
        pcm = content
    elif Path(filename).suffix.lower() == ".wav":
        from .wyoming_stt import _pcm_from_wav

        pcm, rate, width, channels = _pcm_from_wav(content)
    else:
        raise RuntimeError(f"Unsupported audio upload for Wyoming STT: {filename}")

    return transcribe_wyoming_pcm(
        pcm,
        sample_rate=rate,
        width=width,
        channels=channels,
    )


def synthesize_speech_bytes(text: str, voice: Optional[str] = None) -> bytes:
    if not text.strip():
        return b""
    chunks = list(synthesize_speech_pcm_chunks(text, voice=voice))
    if chunks:
        return b"".join(chunks)
    return b""


def synthesize_speech_pcm_chunks(
    text: str,
    *,
    voice: Optional[str] = None,
    chunk_size: int = 4096,
) -> Iterator[bytes]:
    if not text.strip():
        return
    voice_name = _piper_voice(voice)
    yield from synthesize_wyoming_pcm_chunks(
        text,
        voice=voice_name,
        chunk_size=chunk_size,
    )
