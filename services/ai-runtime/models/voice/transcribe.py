"""Speech-to-text: ffmpeg preprocess → validate → model chain."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import httpx

from models.config_loader import model_def
from models.model_resolver import model_is_available
from models.registry import (
    Capability,
    pollinations_model_id,
    resolve_models,
    _pollinations_api_key,
    _pollinations_base_url,
)
from models.voice.mime import audio_mime_type
from models.voice.preprocess import prepare_upload
from models.voice.validation import (
    TranscriptionRejected,
    reject_after_transcription,
    reject_before_transcription,
)

logger = logging.getLogger(__name__)

_POLLINATIONS_TRANSCRIPTION_ALIASES: dict[str, str] = {
    "openai": "whisper-1",
    "openai-audio": "whisper-1",
    "whisper": "whisper-1",
    "whisper-large-v3": "whisper-large-v3",
    "scribe": "scribe",
    "scribe_v2": "scribe_v2",
}


def _pollinations_model(model_name: str) -> str:
    raw = pollinations_model_id(model_name)
    return _POLLINATIONS_TRANSCRIPTION_ALIASES.get(raw, raw)


def _is_whisper_model(model_name: str) -> bool:
    return model_name.startswith("pollinations/")


def _transcription_timeout_seconds(duration_s: float, *, whisper: bool) -> float:
    if whisper:
        return min(300.0, max(45.0, duration_s * 2.0 + 20.0))
    return min(600.0, max(90.0, duration_s * 3.0 + 45.0))


def _ordered_transcription_models(models: list[str]) -> list[str]:
    """Dedicated Whisper STT first; multimodal LLM adapters only as fallback."""
    whisper = [m for m in models if _is_whisper_model(m)]
    rest = [m for m in models if not _is_whisper_model(m)]
    return whisper + rest


def _pollinations_transcribe_form(model_name: str) -> dict[str, str]:
    form: dict[str, str] = {
        "model": _pollinations_model(model_name),
        "response_format": "json",
        "temperature": "0",
    }
    language = os.getenv("TRANSCRIBE_LANGUAGE", "").strip()
    if language:
        form["language"] = language
    return form


def _transcribe_pollinations(wav_path: str, model_name: str, *, timeout: float) -> str:
    provider_model = _pollinations_model(model_name)
    base = _pollinations_base_url()
    v1 = base if base.endswith("/v1") else f"{base}/v1"
    url = f"{v1}/audio/transcriptions"
    file_name = Path(wav_path).name
    mime = audio_mime_type(file_name)

    with open(wav_path, "rb") as audio_file:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {_pollinations_api_key()}",
                    "User-Agent": "Ai-Assistant/1.0",
                },
                files={"file": (file_name, audio_file, mime)},
                data=_pollinations_transcribe_form(model_name),
            )

    if response.status_code >= 400:
        detail = response.text
        hint = ""
        if "Failed to read and convert audio" in detail or "Failed to open" in detail:
            hint = " Audio should already be 16 kHz mono WAV from ffmpeg preprocessing."
        raise RuntimeError(
            f"Pollinations transcription failed ({response.status_code}): {detail}{hint}"
        )

    payload = response.json()
    if isinstance(payload, dict) and "text" in payload:
        return str(payload["text"])
    return str(payload)


def _transcribe_with_model(
    wav_path: str, model_name: str, *, timeout: float, duration_s: float
) -> str | None:
    entry = model_def(model_name) or {}
    adapter = str(entry.get("adapter") or "")
    if adapter == "multimodal_stt":
        if not model_is_available(model_name):
            return None
        from models.providers.dispatch import transcribe_file_for_model

        return transcribe_file_for_model(model_name, wav_path, duration_s=duration_s)
    if _is_whisper_model(model_name):
        return _transcribe_pollinations(wav_path, model_name, timeout=timeout)
    return None


def transcribe_audio(content: bytes, filename: str = "audio.m4a") -> str:
    if len(content) < 256:
        raise TranscriptionRejected(
            "Recording too short or empty — speak for at least one second and try again"
        )

    models = resolve_models(Capability.TRANSCRIPTION)
    if not models:
        raise RuntimeError(
            "No transcription models configured — set NVIDIA_API_KEY or POLLINATIONS_API_KEY in .env"
        )

    last_error: Optional[Exception] = None
    with prepare_upload(content, filename) as prepared:
        reject_before_transcription(prepared.metrics)
        wav_path = prepared.wav_path
        duration_s = prepared.metrics.duration_seconds
        models_to_try = _ordered_transcription_models(models)

        for model_name in models_to_try:
            whisper = _is_whisper_model(model_name)
            timeout = _transcription_timeout_seconds(duration_s, whisper=whisper)
            try:
                text = _transcribe_with_model(
                    wav_path, model_name, timeout=timeout, duration_s=duration_s
                )
                if text is None:
                    continue
                if not str(text).strip():
                    raise RuntimeError("Empty transcription result")
                cleaned = str(text).strip()
                reject_after_transcription(cleaned, prepared.metrics)
                logger.info(
                    "Transcription completed via %s (%.1fs audio)",
                    model_name,
                    duration_s,
                )
                return cleaned
            except TranscriptionRejected:
                raise
            except Exception as exc:
                last_error = exc
                logger.warning("Transcription model %s failed: %s", model_name, exc)
                continue

    raise RuntimeError(f"Transcription failed: {last_error}")
