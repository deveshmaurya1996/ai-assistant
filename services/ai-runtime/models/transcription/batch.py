from models.transcription.provider import TranscriptionProvider
from models.voice.transcribe import transcribe_audio


class BatchTranscriptionProvider(TranscriptionProvider):
    def transcribe(self, content: bytes, filename: str = "audio.m4a") -> str:
        return transcribe_audio(content, filename)
