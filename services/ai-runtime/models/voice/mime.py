"""Audio MIME types for uploads and provider APIs."""

from __future__ import annotations

from pathlib import Path

_TRANSCRIBE_SAMPLE_RATE = 16_000
_TRANSCRIBE_CHANNELS = 1


def transcribe_sample_rate() -> int:
    return _TRANSCRIBE_SAMPLE_RATE


def transcribe_channels() -> int:
    return _TRANSCRIBE_CHANNELS


def audio_mime_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".webm":
        return "audio/webm"
    if suffix in (".3gp", ".3gpp"):
        return "audio/3gpp"
    if suffix == ".wav":
        return "audio/wav"
    if suffix == ".mp3":
        return "audio/mpeg"
    if suffix == ".caf":
        return "audio/x-caf"
    if suffix == ".ogg":
        return "audio/ogg"
    return "audio/m4a"
