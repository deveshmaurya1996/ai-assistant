"""Server-side voice pipeline: ffmpeg preprocessing, validation, STT.

Import transcribe_audio from models.voice.transcribe (not here) to avoid circular
imports with models.providers.dispatch.
"""

from models.voice.ffmpeg import FFMPEG_INSTALL_HINT, ensure_ffmpeg_on_path, ffmpeg_available
from models.voice.preprocess import AudioSpeechMetrics, PreparedAudio, prepare_upload

__all__ = [
    "FFMPEG_INSTALL_HINT",
    "AudioSpeechMetrics",
    "PreparedAudio",
    "ffmpeg_available",
    "ensure_ffmpeg_on_path",
    "prepare_upload",
]
