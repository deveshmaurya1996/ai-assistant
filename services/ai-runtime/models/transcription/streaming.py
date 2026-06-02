import os
from typing import Optional

from models.transcription.batch import BatchTranscriptionProvider
from models.transcription.provider import TranscriptionProvider


class StreamingTranscriptionProvider(TranscriptionProvider):
    def __init__(self) -> None:
        self._fallback = BatchTranscriptionProvider()
        self._provider = os.getenv("VOICE_STT_PROVIDER", "batch").strip().lower()
        self._deepgram_key = os.getenv("DEEPGRAM_API_KEY", "").strip()

    def transcribe(self, content: bytes, filename: str = "audio.m4a") -> str:
        if self._provider == "deepgram" and self._deepgram_key:
            pass
        return self._fallback.transcribe(content, filename)

    def transcribe_partial(
        self, content: bytes, filename: str = "audio.m4a"
    ) -> Optional[str]:
        if self._provider in ("deepgram", "realtime") and self._deepgram_key:
            return None
        return self._fallback.transcribe_partial(content, filename)
