import os

from models.transcription.batch import BatchTranscriptionProvider
from models.transcription.provider import TranscriptionProvider
from models.transcription.streaming import StreamingTranscriptionProvider

_provider: TranscriptionProvider | None = None


def get_transcription_provider() -> TranscriptionProvider:
    global _provider
    mode = os.getenv("VOICE_STT_PROVIDER", "faster-whisper").strip().lower()
    if _provider is not None:
        cached_mode = getattr(_provider, "_voice_stt_mode", None)
        if cached_mode == mode:
            return _provider

    if mode in ("faster-whisper", "streaming", "realtime"):
        _provider = StreamingTranscriptionProvider()
    else:
        _provider = BatchTranscriptionProvider()
    setattr(_provider, "_voice_stt_mode", mode)
    return _provider
