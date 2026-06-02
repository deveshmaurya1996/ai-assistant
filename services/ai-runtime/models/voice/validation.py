
from __future__ import annotations

import re

from models.voice.preprocess import AudioSpeechMetrics

MIN_TRANSCRIBE_DURATION_S = 0.35
SILENCE_MEAN_VOLUME_DB = -48.0
SILENCE_PEAK_VOLUME_DB = -40.0
LONG_AUDIO_DURATION_S = 15.0

_WHISPER_HALLUCINATION_PHRASES: frozenset[str] = frozenset(
    {
        "thank you",
        "thanks",
        "thanks for watching",
        "thank you for watching",
        "you",
        "bye",
        "subtitle",
        "subtitles",
        "music",
        "applause",
        "silence",
        "the end",
        "okay",
        "ok",
        "welcome",
        "hello",
        "goodbye",
    }
)

_HALLUCINATION_SUBSTRINGS: tuple[str, ...] = (
    "welcome to my channel",
    "welcome to the channel",
    "thanks for watching",
    "thank you for watching",
    "like and subscribe",
    "see you next time",
    "see you in the next video",
    "subtitles by",
    "captioned by",
    "translated by",
)


def _normalize_phrase(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def _is_short_hallucination(text: str) -> bool:
    normalized = _normalize_phrase(text)
    if not normalized:
        return True
    if normalized in _WHISPER_HALLUCINATION_PHRASES:
        return True
    return len(normalized) <= 2


def _matches_known_hallucination(text: str) -> bool:
    if _is_short_hallucination(text):
        return True
    normalized = _normalize_phrase(text)
    return any(fragment in normalized for fragment in _HALLUCINATION_SUBSTRINGS)


def lacks_clear_speech(metrics: AudioSpeechMetrics) -> bool:
    if metrics.max_volume_db < SILENCE_PEAK_VOLUME_DB:
        return True
    if metrics.duration_seconds >= LONG_AUDIO_DURATION_S:
        return False
    if metrics.mean_volume_db < SILENCE_MEAN_VOLUME_DB:
        return True
    return False


class TranscriptionRejected(RuntimeError):
    """Non-retryable rejection (e.g. silence / STT hallucination on quiet audio)."""


def reject_before_transcription(metrics: AudioSpeechMetrics) -> None:
    if metrics.duration_seconds < MIN_TRANSCRIBE_DURATION_S:
        raise TranscriptionRejected(
            "Recording too short or empty — speak for at least one second and try again"
        )
    if lacks_clear_speech(metrics):
        raise TranscriptionRejected("No speech detected in recording")


def reject_after_transcription(text: str, metrics: AudioSpeechMetrics) -> None:
    if lacks_clear_speech(metrics):
        raise TranscriptionRejected("No speech detected in recording")
    borderline_peak = metrics.max_volume_db < SILENCE_PEAK_VOLUME_DB + 6
    if borderline_peak and _matches_known_hallucination(text):
        raise TranscriptionRejected("No speech detected in recording")
