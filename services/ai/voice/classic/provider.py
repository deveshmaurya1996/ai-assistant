
from models import media
from models.transcription import get_transcription_provider


class ClassicVoiceProvider:

    def transcribe(self, content: bytes, filename: str = "audio.m4a") -> str:
        return get_transcription_provider().transcribe(content, filename)

    def synthesize(self, text: str, voice: str | None = None) -> bytes:
        return media.synthesize_speech(text, voice=voice)
