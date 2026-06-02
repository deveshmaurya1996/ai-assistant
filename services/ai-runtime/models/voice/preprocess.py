"""Normalize uploads to STT-ready WAV and measure loudness via ffmpeg."""

from __future__ import annotations

import logging
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from models.voice.ffmpeg import convert_to_wav, probe_duration_seconds, probe_volume_db
from models.voice.mime import transcribe_channels, transcribe_sample_rate

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AudioSpeechMetrics:
    duration_seconds: float
    mean_volume_db: float
    max_volume_db: float


@dataclass(frozen=True)
class PreparedAudio:
    """16 kHz mono WAV ready for STT, with ffmpeg loudness metrics."""

    wav_path: str
    metrics: AudioSpeechMetrics


def analyze_audio(path: str, *, volume_timeout: float = 60.0) -> AudioSpeechMetrics:
    duration = probe_duration_seconds(path)
    analyze_window = min(duration, 45.0) if duration > 45.0 else None
    mean_db, peak_db = probe_volume_db(
        path,
        timeout=volume_timeout,
        analyze_seconds=analyze_window,
    )
    return AudioSpeechMetrics(
        duration_seconds=duration,
        mean_volume_db=mean_db,
        max_volume_db=peak_db,
    )


def normalize_to_wav(source_path: str, *, convert_timeout: float = 120.0) -> str:
    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    out.close()
    try:
        convert_to_wav(
            source_path,
            out.name,
            sample_rate=transcribe_sample_rate(),
            channels=transcribe_channels(),
            timeout=convert_timeout,
        )
        logger.info(
            "Normalized %s → %d Hz mono WAV",
            Path(source_path).suffix or "audio",
            transcribe_sample_rate(),
        )
        return out.name
    except Exception:
        Path(out.name).unlink(missing_ok=True)
        raise


def _estimate_duration_seconds(content: bytes) -> float:
    """Rough duration guess from upload size when container metadata is missing."""
    return max(1.0, len(content) / 8000.0)


@contextmanager
def prepare_upload(content: bytes, filename: str) -> Iterator[PreparedAudio]:
    """Write upload to disk, ffmpeg-normalize to WAV, probe metrics, then cleanup."""
    suffix = Path(filename).suffix or ".m4a"
    raw_path: str | None = None
    wav_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as raw:
            raw.write(content)
            raw.flush()
            raw_path = raw.name
        estimated_duration = _estimate_duration_seconds(content)
        convert_timeout = max(120.0, estimated_duration * 2.5 + 30.0)
        wav_path = normalize_to_wav(raw_path, convert_timeout=convert_timeout)

        duration = probe_duration_seconds(wav_path)
        volume_timeout = max(60.0, duration * 1.5 + 15.0)
        mean_db, peak_db = probe_volume_db(wav_path, timeout=volume_timeout)
        metrics = AudioSpeechMetrics(
            duration_seconds=duration,
            mean_volume_db=mean_db,
            max_volume_db=peak_db,
        )
        yield PreparedAudio(wav_path=wav_path, metrics=metrics)
    finally:
        for path in (wav_path, raw_path):
            if path:
                try:
                    Path(path).unlink(missing_ok=True)
                except OSError:
                    pass
