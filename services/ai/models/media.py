
from __future__ import annotations

import logging
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

from models.audio_normalize import prepare_transcription_file
from models.registry import (
    Capability,
    litellm_kwargs,
    pollinations_model_id,
    resolve_models,
    _pollinations_api_key,
    _pollinations_base_url,
)

logger = logging.getLogger(__name__)

_POLLINATIONS_TRANSCRIPTION_MODEL_ALIASES: dict[str, str] = {
    "openai": "whisper-1",
    "openai-audio": "whisper-1",
    "whisper": "whisper-1",
    "whisper-large-v3": "whisper-large-v3",
    "scribe": "scribe",
    "scribe_v2": "scribe_v2",
}


def _pollinations_transcription_model(model_name: str) -> str:
    raw = pollinations_model_id(model_name)
    return _POLLINATIONS_TRANSCRIPTION_MODEL_ALIASES.get(raw, raw)


def _audio_mime_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".webm":
        return "audio/webm"
    if suffix in (".3gp", ".3gpp"):
        return "audio/3gpp"
    if suffix == ".wav":
        return "audio/wav"
    if suffix == ".mp3":
        return "audio/mpeg"
    if suffix == ".caf":
        return "audio/x-caf"
    return "audio/m4a"


def transcribe_audio(content: bytes, filename: str = "audio.m4a") -> str:
    if len(content) < 256:
        raise RuntimeError(
            "Recording too short or empty — speak for at least one second and try again"
        )

    suffix = Path(filename).suffix or ".m4a"
    models = resolve_models(Capability.TRANSCRIPTION)

    if not models:
        raise RuntimeError(
            "No transcription models configured — set OPENAI_API_KEY or POLLINATIONS_API_KEY"
        )

    last_error: Optional[Exception] = None
    for model_name in models:
        tmp_path: Optional[str] = None
        converted_path: Optional[str] = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(content)
                tmp.flush()
                tmp_path = tmp.name

            transcribe_path, converted_path = prepare_transcription_file(tmp_path)

            if model_name.startswith("pollinations/"):
                text = _pollinations_transcribe(transcribe_path, model_name)
            else:
                import litellm

                litellm.suppress_debug_info = True
                kwargs = litellm_kwargs(model_name)
                with open(transcribe_path, "rb") as audio_file:
                    response = litellm.transcription(file=audio_file, **kwargs)
                text = response.text

            if not (text and str(text).strip()):
                raise RuntimeError("Empty transcription result")

            logger.info("Transcription completed via %s", model_name)
            return str(text).strip()
        except Exception as e:
            last_error = e
            logger.warning("Transcription model %s failed: %s", model_name, e)
            continue
        finally:
            for path in (converted_path, tmp_path):
                if path:
                    try:
                        Path(path).unlink(missing_ok=True)
                    except OSError:
                        pass

    raise RuntimeError(f"Transcription failed: {last_error}")


def _pollinations_transcribe(file_path: str, model_name: str) -> str:
    import httpx

    provider_model = _pollinations_transcription_model(model_name)
    base = _pollinations_base_url()
    v1 = base if base.endswith("/v1") else f"{base}/v1"
    url = f"{v1}/audio/transcriptions"

    file_name = Path(file_path).name
    mime = _audio_mime_type(file_name)

    with open(file_path, "rb") as audio_file:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {_pollinations_api_key()}",
                    "User-Agent": "Ai-Assistant/1.0",
                },
                files={"file": (file_name, audio_file, mime)},
                data={"model": provider_model},
            )

    if response.status_code >= 400:
        detail = response.text
        hint = ""
        if "Failed to read and convert audio" in detail or "Failed to open" in detail:
            hint = (
                " Pollinations could not decode this audio format. "
                "On Android, record as WebM (app update) or install ffmpeg on the AI server "
                "to convert m4a/caf to WAV."
            )
        raise RuntimeError(
            f"Pollinations transcription failed ({response.status_code}): {detail}{hint}"
        )

    payload = response.json()
    if isinstance(payload, dict) and "text" in payload:
        return str(payload["text"])
    return str(payload)


def synthesize_speech(text: str, voice: Optional[str] = None) -> bytes:
    models = resolve_models(Capability.SPEECH)
    voice = voice or __import__("os").getenv("SPEECH_VOICE", "alloy")

    if not models:
        return b""

    last_error: Optional[Exception] = None
    for model_name in models:
        try:
            if model_name.startswith("pollinations/"):
                audio = _pollinations_speech(text, model_name, voice=voice)
            else:
                import litellm

                litellm.suppress_debug_info = True
                kwargs = litellm_kwargs(model_name)
                response = litellm.speech(
                    input=text,
                    voice=voice,
                    **kwargs,
                )
                audio = response.content

            if audio:
                logger.info("Speech synthesis completed via %s", model_name)
                return audio
        except Exception as e:
            last_error = e
            logger.warning("Speech model %s failed: %s", model_name, e)
            continue

    logger.error("All speech models failed: %s", last_error)
    return b""


def _pollinations_speech(text: str, model_name: str, voice: Optional[str] = None) -> bytes:
    speech_voice = (voice or __import__("os").getenv("SPEECH_VOICE", "nova")).strip() or "nova"
    encoded = urllib.parse.quote(text, safe="")
    url = (
        f"{_pollinations_base_url()}/audio/{encoded}"
        f"?voice={urllib.parse.quote(speech_voice)}"
    )
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {_pollinations_api_key()}",
            "User-Agent": "Ai-Assistant/1.0",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def generate_image(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
) -> bytes:
    models = resolve_models(Capability.IMAGE)

    if not models:
        raise RuntimeError(
            "No image models available — set POLLINATIONS_API_KEY or OPENAI_API_KEY"
        )

    last_error: Optional[Exception] = None
    for model_name in models:
        try:
            if model_name.startswith("pollinations/"):
                image = _pollinations_image(prompt, model_name, width, height)
            elif model_name == "dall-e-3":
                image = _openai_image(prompt, width, height)
            else:
                continue

            if image:
                logger.info("Image generated via %s", model_name)
                return image
        except Exception as e:
            last_error = e
            logger.warning("Image model %s failed: %s", model_name, e)
            continue

    raise RuntimeError(f"All image models failed: {last_error}")


def _pollinations_image(
    prompt: str, model_name: str, width: int, height: int
) -> bytes:
    provider_model = pollinations_model_id(model_name)
    encoded = urllib.parse.quote(prompt, safe="")
    params = urllib.parse.urlencode(
        {"model": provider_model, "width": width, "height": height}
    )
    url = f"{_pollinations_base_url()}/image/{encoded}?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {_pollinations_api_key()}",
            "User-Agent": "Ai-Assistant/1.0",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.read()


def _openai_image(prompt: str, width: int, height: int) -> bytes:
    import litellm

    litellm.suppress_debug_info = True
    size = "1024x1024"
    if width >= 1792 or height >= 1792:
        size = "1792x1024" if width >= height else "1024x1792"

    response = litellm.image_generation(
        model="dall-e-3",
        prompt=prompt,
        size=size,
        api_key=__import__("os").getenv("OPENAI_API_KEY"),
    )
    if hasattr(response, "data") and response.data:
        item = response.data[0]
        if hasattr(item, "b64_json") and item.b64_json:
            import base64

            return base64.b64decode(item.b64_json)
        if hasattr(item, "url") and item.url:
            with urllib.request.urlopen(item.url, timeout=60) as resp:
                return resp.read()
    return b""
