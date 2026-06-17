from __future__ import annotations

import io
import json
import os
import socket
import wave
from typing import Optional, Tuple
from urllib.parse import urlparse

from .pcm import voice_gateway_pcm_sample_rate
from .wyoming_tts import _read_wyoming_event


def faster_whisper_tcp_target() -> Tuple[str, int]:
    raw = os.getenv("FASTER_WHISPER_URL", "tcp://localhost:10300").strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        host = parsed.hostname or "localhost"
        port = parsed.port or 10300
        return host, port

    if raw.startswith("tcp://"):
        parsed = urlparse(raw)
        host = parsed.hostname or "localhost"
        port = parsed.port or 10300
        return host, port

    parsed = urlparse(raw if "://" in raw else f"tcp://{raw}")
    host = parsed.hostname or "localhost"
    port = parsed.port or 10300
    return host, port


def _write_wyoming_event(
    sock: socket.socket,
    event_type: str,
    data: Optional[dict] = None,
    payload: bytes = b"",
) -> None:
    header: dict = {"type": event_type}
    data_bytes = b""
    if data:
        data_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        header["data_length"] = len(data_bytes)
    if payload:
        header["payload_length"] = len(payload)
    sock.sendall((json.dumps(header) + "\n").encode("utf-8"))
    if data_bytes:
        sock.sendall(data_bytes)
    if payload:
        sock.sendall(payload)


def _pcm_from_wav(content: bytes) -> tuple[bytes, int, int, int]:
    with wave.open(io.BytesIO(content), "rb") as wf:
        rate = wf.getframerate()
        width = wf.getsampwidth()
        channels = wf.getnchannels()
        pcm = wf.readframes(wf.getnframes())
    return pcm, rate, width, channels


def transcribe_wyoming_pcm(
    pcm: bytes,
    *,
    sample_rate: int | None = None,
    width: int = 2,
    channels: int = 1,
    chunk_size: int = 4096,
    connect_timeout: float = 10.0,
    read_timeout: float = 120.0,
) -> str:
    if not pcm:
        return ""

    rate = sample_rate if sample_rate and sample_rate > 0 else voice_gateway_pcm_sample_rate()
    host, port = faster_whisper_tcp_target()
    model = os.getenv("FASTER_WHISPER_MODEL", "base.en").strip() or None
    language = os.getenv("FASTER_WHISPER_LANGUAGE", "en").strip() or None

    transcribe_data: dict = {}
    if model:
        transcribe_data["name"] = model
    if language:
        transcribe_data["language"] = language

    audio_format = {"rate": rate, "width": width, "channels": channels}
    transcript_parts: list[str] = []

    with socket.create_connection((host, port), timeout=connect_timeout) as sock:
        sock.settimeout(read_timeout)
        _write_wyoming_event(sock, "transcribe", transcribe_data or None)
        _write_wyoming_event(sock, "audio-start", audio_format)

        for offset in range(0, len(pcm), chunk_size):
            chunk = pcm[offset : offset + chunk_size]
            chunk_data = {**audio_format, "timestamp": int(offset / (rate * width * channels) * 1000)}
            _write_wyoming_event(sock, "audio-chunk", chunk_data, chunk)

        _write_wyoming_event(sock, "audio-stop", {})

        while True:
            try:
                header, _payload = _read_wyoming_event(sock)
            except EOFError:
                break

            event_type = header.get("type")
            data = header.get("data") or {}

            if event_type == "transcript" and isinstance(data, dict):
                text = str(data.get("text") or "").strip()
                if text:
                    transcript_parts.append(text)
                break
            if event_type == "transcript-chunk" and isinstance(data, dict):
                text = str(data.get("text") or "").strip()
                if text:
                    transcript_parts.append(text)
            elif event_type == "transcript-stop":
                break
            elif event_type == "error":
                message = data.get("message") if isinstance(data, dict) else str(data)
                raise RuntimeError(message or "faster-whisper transcription failed")

    return " ".join(part for part in transcript_parts if part).strip()
