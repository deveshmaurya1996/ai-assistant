from __future__ import annotations

import json
import os
import socket
from typing import Iterator, Tuple
from urllib.parse import urlparse


def piper_tcp_target() -> Tuple[str, int]:
    raw = os.getenv("PIPER_URL", "http://localhost:5000").strip()
    if raw.startswith("tcp://"):
        parsed = urlparse(raw)
        host = parsed.hostname or "localhost"
        port = parsed.port or 5000
        return host, port

    parsed = urlparse(raw if "://" in raw else f"tcp://{raw}")
    host = parsed.hostname or "localhost"
    port = parsed.port or 5000
    return host, port


def _read_wyoming_event(sock: socket.socket) -> tuple[dict, bytes]:
    line = bytearray()
    while True:
        byte = sock.recv(1)
        if not byte:
            raise EOFError("piper connection closed")
        line.extend(byte)
        if byte == b"\n":
            break

    header = json.loads(line.decode("utf-8"))
    data_length = int(header.get("data_length") or 0)
    payload_length = int(header.get("payload_length") or 0)

    extra = bytearray()
    while len(extra) < data_length:
        chunk = sock.recv(data_length - len(extra))
        if not chunk:
            raise EOFError("piper connection closed while reading data")
        extra.extend(chunk)

    payload = bytearray()
    while len(payload) < payload_length:
        chunk = sock.recv(payload_length - len(payload))
        if not chunk:
            raise EOFError("piper connection closed while reading payload")
        payload.extend(chunk)

    if extra:
        merged = header.get("data") or {}
        if isinstance(merged, dict):
            extra_data = json.loads(extra.decode("utf-8"))
            if isinstance(extra_data, dict):
                merged = {**merged, **extra_data}
                header["data"] = merged

    return header, bytes(payload)


def synthesize_wyoming_pcm_chunks(
    text: str,
    *,
    voice: str,
    chunk_size: int = 4096,
    connect_timeout: float = 10.0,
    read_timeout: float = 120.0,
) -> Iterator[bytes]:
    trimmed = text.strip()
    if not trimmed:
        return

    host, port = piper_tcp_target()
    request = {
        "type": "synthesize",
        "data": {
            "text": trimmed,
            "voice": {"name": voice},
        },
    }

    with socket.create_connection((host, port), timeout=connect_timeout) as sock:
        sock.settimeout(read_timeout)
        sock.sendall((json.dumps(request) + "\n").encode("utf-8"))

        while True:
            header, payload = _read_wyoming_event(sock)
            event_type = header.get("type")

            if event_type == "audio-chunk" and payload:
                for offset in range(0, len(payload), chunk_size):
                    yield payload[offset : offset + chunk_size]
            elif event_type == "audio-stop":
                break
            elif event_type == "error":
                data = header.get("data") or {}
                message = data.get("message") if isinstance(data, dict) else str(data)
                raise RuntimeError(message or "piper synthesis failed")
