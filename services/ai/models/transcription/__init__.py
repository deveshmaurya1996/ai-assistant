import os

from models.transcription.batch import BatchTranscriptionProvider
from models.transcription.provider import TranscriptionProvider
from models.transcription.streaming import StreamingTranscriptionProvider

_provider: TranscriptionProvider | None = None


def get_transcription_provider() -> TranscriptionProvider:
    global _provider
    if _provider is not None:
        return _provider

    mode = os.getenv("VOICE_STT_PROVIDER", "batch").strip().lower()
    if mode in ("deepgram", "realtime", "streaming"):
        _provider = StreamingTranscriptionProvider()
    else:
        _provider = BatchTranscriptionProvider()
    return _provider
