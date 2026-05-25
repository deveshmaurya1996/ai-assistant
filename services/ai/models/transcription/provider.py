from abc import ABC, abstractmethod
from typing import Optional


class TranscriptionProvider(ABC):
    @abstractmethod
    def transcribe(self, content: bytes, filename: str = "audio.m4a") -> str:
        raise NotImplementedError

    def transcribe_partial(
        self, content: bytes, filename: str = "audio.m4a"
    ) -> Optional[str]:
        return None
