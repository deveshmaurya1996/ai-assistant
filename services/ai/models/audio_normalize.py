from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_TRANSCRIBE_FRIENDLY_SUFFIXES = {".wav", ".webm", ".mp3", ".mpeg", ".mp4", ".ogg", ".flac"}


def prepare_transcription_file(source_path: str) -> tuple[str, str | None]:

    path = Path(source_path)
    suffix = path.suffix.lower()

    if suffix in _TRANSCRIBE_FRIENDLY_SUFFIXES:
        return str(path), None

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        logger.warning(
            "ffmpeg not found; sending %s as-is (Pollinations may reject m4a/caf)",
            suffix,
        )
        return str(path), None

    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    out.close()
    wav_path = out.name

    try:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(path),
                "-ar",
                "16000",
                "-ac",
                "1",
                wav_path,
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )
        logger.info("Converted %s to WAV for transcription", suffix)
        return wav_path, wav_path
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
        try:
            Path(wav_path).unlink(missing_ok=True)
        except OSError:
            pass
        logger.warning("ffmpeg convert failed for %s: %s", suffix, exc)
        return str(path), None
