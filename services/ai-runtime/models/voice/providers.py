from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Iterator, Optional

from .pcm import is_raw_pcm_filename, voice_gateway_pcm_sample_rate
from .wyoming_tts import synthesize_wyoming_pcm_chunks

logger = logging.getLogger(__name__)

DEFAULT_STT_PROVIDER = "faster-whisper"
DEFAULT_TTS_PROVIDER = "piper"
DEFAULT_FASTER_WHISPER_MODEL = "base.en"
DEFAULT_PIPER_VOICE = "en_US-lessac-medium"
DEFAULT_PCM_SAMPLE_RATE = 24_000

LEGACY_VOICE_ALIASES: dict[str, str] = {
    "female-professional": "en_US-lessac-medium",
    "female-friendly": "en_US-hannah-medium",
    "male-executive": "en_US-ryan-medium",
    "teacher-calm": "en_US-amy-medium",
    "friendly-neutral": "en_US-danny-low",
    "alloy": "en_US-lessac-medium",
    "nova": "en_US-amy-medium",
    "onyx": "en_US-ryan-medium",
    "shimmer": "en_US-hannah-medium",
    "fable": "en_US-danny-low",
}


def _piper_voice(voice: Optional[str]) -> str:
    raw = (voice or os.getenv("PIPER_DEFAULT_VOICE", DEFAULT_PIPER_VOICE)).strip()
    return LEGACY_VOICE_ALIASES.get(raw, raw)


def transcribe_audio_bytes(content: bytes, filename: str = "audio.m4a") -> str:
    import numpy as np
    import io
    import wave
    from .streaming_stt import transcribe_audio_chunk

    rate = voice_gateway_pcm_sample_rate()
    width = 2
    channels = 1
    pcm = content

    if is_raw_pcm_filename(filename):
        pcm = content
    elif Path(filename).suffix.lower() == ".wav":
        with wave.open(io.BytesIO(content), "rb") as wf:
            rate = wf.getframerate()
            width = wf.getsampwidth()
            channels = wf.getnchannels()
            pcm = wf.readframes(wf.getnframes())
    else:
        raise RuntimeError(f"Unsupported audio upload for local STT: {filename}")

    # Convert PCM to float32 NumPy array
    if width == 1:
        audio_int = np.frombuffer(pcm, dtype=np.uint8).astype(np.float32) - 128.0
        audio_float32 = audio_int / 128.0
    elif width == 2:
        audio_float32 = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    elif width == 4:
        audio_float32 = np.frombuffer(pcm, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise RuntimeError(f"Unsupported sample width: {width}")

    if channels > 1:
        audio_float32 = audio_float32.reshape(-1, channels).mean(axis=1)

    language = os.getenv("FASTER_WHISPER_LANGUAGE", "en").strip() or None
    return transcribe_audio_chunk(audio_float32, language=language)


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
