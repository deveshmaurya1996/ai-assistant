import logging
import os
from typing import Optional

from models.transcription.batch import BatchTranscriptionProvider
from models.transcription.provider import TranscriptionProvider
from models.voice.providers import transcribe_audio_bytes

logger = logging.getLogger(__name__)


class StreamingTranscriptionProvider(TranscriptionProvider):
    def __init__(self) -> None:
        self._fallback = BatchTranscriptionProvider()
        self._provider = os.getenv("VOICE_STT_PROVIDER", "faster-whisper").strip().lower()

    def transcribe(self, content: bytes, filename: str = "audio.m4a") -> str:
        if self._provider in ("faster-whisper", "local-streaming", "streaming", "realtime"):
            try:
                return transcribe_audio_bytes(content, filename)
            except Exception as exc:
                logger.warning(
                    "local Whisper STT failed (%s); falling back to batch transcription",
                    exc,
                )
        return self._fallback.transcribe(content, filename)

    def transcribe_partial(
        self, content: bytes, filename: str = "audio.m4a"
    ) -> Optional[str]:
        if self._provider in ("faster-whisper", "local-streaming", "streaming", "realtime"):
            return None
        return self._fallback.transcribe_partial(content, filename)
