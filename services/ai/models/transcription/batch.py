from models import media
from models.transcription.provider import TranscriptionProvider


class BatchTranscriptionProvider(TranscriptionProvider):
    def transcribe(self, content: bytes, filename: str = "audio.m4a") -> str:
        return media.transcribe_audio(content, filename)
