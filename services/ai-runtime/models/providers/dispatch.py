from __future__ import annotations

from models.config_loader import model_def
from models.providers.magpie_tts import synthesize_speech as magpie_synthesize
from models.providers.nvidia_multimodal_stt import transcribe_audio_file as multimodal_transcribe


def _adapter_for(model_id: str) -> str:
    entry = model_def(model_id) or {}
    adapter = str(entry.get("adapter") or "").strip()
    if adapter:
        return adapter
    if model_id.startswith("pollinations/"):
        return "pollinations"
    return "openai_chat"


def transcribe_file_for_model(
    model_id: str, wav_path: str, *, duration_s: float | None = None
) -> str:
    adapter = _adapter_for(model_id)
    if adapter == "multimodal_stt":
        return multimodal_transcribe(model_id, wav_path, duration_s=duration_s)
    raise RuntimeError(f"Model {model_id} has no transcription adapter ({adapter})")


def synthesize_speech_for_model(model_id: str, text: str) -> bytes:
    adapter = _adapter_for(model_id)
    if adapter == "magpie_tts":
        return magpie_synthesize(model_id, text)
    raise RuntimeError(f"Model {model_id} has no speech adapter ({adapter})")
