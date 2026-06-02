from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from typing import List, Optional, Tuple

import httpx

from models.config_loader import model_def
from models.model_resolver import model_is_available
from models.providers.dispatch import synthesize_speech_for_model
from models.registry import (
    Capability,
    pollinations_model_id,
    resolve_models,
    _pollinations_api_key,
    _pollinations_base_url,
)
from models.voice.transcribe import transcribe_audio

logger = logging.getLogger(__name__)

_DEFAULT_QUOTA_RETRY_SECONDS = 24 * 60 * 60

__all__ = [
    "transcribe_audio",
    "synthesize_speech",
    "generate_image",
    "edit_image",
    "PollinationsImageError",
    "ImageGenerationFailedError",
    "ImageGenerationResult",
]


@dataclass
class ImageGenerationResult:
    data: bytes
    mime_type: str
    model_used: str


class PollinationsImageError(Exception):
    """Pollinations image API error with user-facing details."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        user_message: str,
        retry_after_seconds: Optional[int] = None,
        is_quota: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.user_message = user_message
        self.retry_after_seconds = retry_after_seconds
        self.is_quota = is_quota


class ImageGenerationFailedError(Exception):
    def __init__(
        self,
        user_message: str,
        *,
        code: str = "image_failed",
        retry_after_seconds: Optional[int] = None,
        last_error: Optional[Exception] = None,
    ) -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.code = code
        self.retry_after_seconds = retry_after_seconds
        self.last_error = last_error


def _parse_retry_after_seconds(
    headers: httpx.Headers, body_text: str
) -> Optional[int]:
    raw = headers.get("Retry-After", "").strip()
    if raw:
        if raw.isdigit():
            return int(raw)
        try:
            dt = parsedate_to_datetime(raw)
            from datetime import datetime, timezone

            delta = dt - datetime.now(timezone.utc)
            return max(0, int(delta.total_seconds()))
        except (TypeError, ValueError, OSError):
            pass
    try:
        payload = json.loads(body_text)
        if isinstance(payload, dict):
            err = payload.get("error")
            if isinstance(err, dict):
                for key in ("retry_after", "retryAfter", "retry_after_seconds"):
                    val = err.get(key)
                    if isinstance(val, (int, float)) and val > 0:
                        return int(val)
    except json.JSONDecodeError:
        pass
    return None


def _quota_user_message(retry_after_seconds: Optional[int]) -> str:
    if retry_after_seconds and retry_after_seconds > 0:
        hours = max(1, round(retry_after_seconds / 3600))
        if hours >= 24:
            return (
                "You have exceeded the image API quota. "
                f"Please try again in about {hours} hours."
            )
        return (
            "You have exceeded the image API quota. "
            f"Please try again in about {hours} hour(s)."
        )
    return (
        "You have exceeded the image API quota. "
        "Please try again in about 24 hours."
    )


def _raise_pollinations_image_error(
    status_code: int, body_text: str, headers: httpx.Headers
) -> None:
    retry_after = _parse_retry_after_seconds(headers, body_text)
    if status_code == 402:
        raise PollinationsImageError(
            body_text[:300],
            status_code=status_code,
            user_message=_quota_user_message(retry_after),
            retry_after_seconds=retry_after or _DEFAULT_QUOTA_RETRY_SECONDS,
            is_quota=True,
        )
    if status_code == 429:
        raise PollinationsImageError(
            body_text[:300],
            status_code=status_code,
            user_message=_quota_user_message(retry_after),
            retry_after_seconds=retry_after or 3600,
            is_quota=True,
        )
    raise PollinationsImageError(
        body_text[:300] or f"HTTP {status_code}",
        status_code=status_code,
        user_message=f"Image service error (HTTP {status_code}). Please try again later.",
        retry_after_seconds=retry_after,
        is_quota=False,
    )


def _pollinations_v1_base() -> str:
    root = _pollinations_base_url().rstrip("/")
    return root if root.endswith("/v1") else f"{root}/v1"


def _pollinations_image_get(
    prompt: str, model_name: str, width: int, height: int
) -> bytes:
    provider_model = pollinations_model_id(model_name)
    encoded = urllib.parse.quote(prompt, safe="")
    params = urllib.parse.urlencode(
        {"model": provider_model, "width": width, "height": height}
    )
    url = f"{_pollinations_base_url()}/image/{encoded}?{params}"
    headers = {
        "Authorization": f"Bearer {_pollinations_api_key()}",
        "User-Agent": "Ai-Assistant/1.0",
    }
    with httpx.Client(timeout=180.0) as client:
        response = client.get(url, headers=headers)
        if response.status_code >= 400:
            _raise_pollinations_image_error(
                response.status_code, response.text, response.headers
            )
        return response.content


def _pollinations_image_edit_post(
    prompt: str,
    model_name: str,
    source_bytes: bytes,
    *,
    width: int,
    height: int,
    mime_type: str = "image/jpeg",
) -> bytes:
    provider_model = pollinations_model_id(model_name)
    url = f"{_pollinations_v1_base()}/images/edits"
    headers = {
        "Authorization": f"Bearer {_pollinations_api_key()}",
        "User-Agent": "Ai-Assistant/1.0",
    }
    files = {"image": ("source.jpg", source_bytes, mime_type)}
    data = {
        "prompt": prompt,
        "model": provider_model,
        "size": f"{width}x{height}",
        "n": "1",
    }
    with httpx.Client(timeout=180.0) as client:
        response = client.post(url, headers=headers, files=files, data=data)
        if response.status_code >= 400:
            _raise_pollinations_image_error(
                response.status_code, response.text, response.headers
            )
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            payload = response.json()
            if isinstance(payload, dict) and payload.get("data"):
                import base64

                item = payload["data"][0]
                if isinstance(item, dict) and item.get("b64_json"):
                    return base64.b64decode(item["b64_json"])
                if isinstance(item, dict) and item.get("url"):
                    img_res = client.get(item["url"], headers=headers)
                    img_res.raise_for_status()
                    return img_res.content
        return response.content


def _run_image_chain(
    models: List[str],
    attempt,
) -> ImageGenerationResult:
    if not models:
        raise ImageGenerationFailedError(
            "No image models available — set POLLINATIONS_API_KEY in .env",
            code="no_models",
        )

    last_error: Optional[Exception] = None
    best_retry_after: Optional[int] = None
    saw_quota = False

    for model_name in models:
        if not model_is_available(model_name):
            continue
        if not model_name.startswith("pollinations/"):
            continue
        try:
            data, mime = attempt(model_name)
            if data:
                logger.info("Image completed via %s", model_name)
                return ImageGenerationResult(
                    data=data, mime_type=mime, model_used=model_name
                )
        except PollinationsImageError as exc:
            last_error = exc
            if exc.is_quota:
                saw_quota = True
                if exc.retry_after_seconds:
                    best_retry_after = exc.retry_after_seconds
            logger.warning("Image model %s failed: %s", model_name, exc)
            continue
        except Exception as exc:
            last_error = exc
            logger.warning("Image model %s failed: %s", model_name, exc)
            continue

    if saw_quota:
        raise ImageGenerationFailedError(
            _quota_user_message(best_retry_after),
            code="quota_exceeded",
            retry_after_seconds=best_retry_after or _DEFAULT_QUOTA_RETRY_SECONDS,
            last_error=last_error,
        )
    raise ImageGenerationFailedError(
        "Image generation failed. All image models are unavailable. Please try again later.",
        code="image_failed",
        last_error=last_error,
    )


def _detect_mime(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:4] == b"RIFF" and len(data) > 12 and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def generate_image(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
) -> ImageGenerationResult:
    models = resolve_models(Capability.IMAGE)

    def attempt(model_name: str) -> Tuple[bytes, str]:
        data = _pollinations_image_get(prompt, model_name, width, height)
        return data, _detect_mime(data)

    return _run_image_chain(models, attempt)


def edit_image(
    prompt: str,
    source_bytes: bytes,
    *,
    width: int = 1024,
    height: int = 1024,
    mime_type: str = "image/jpeg",
) -> ImageGenerationResult:
    models = resolve_chain_image_edit()

    def attempt(model_name: str) -> Tuple[bytes, str]:
        try:
            data = _pollinations_image_edit_post(
                prompt,
                model_name,
                source_bytes,
                width=width,
                height=height,
                mime_type=mime_type,
            )
            return data, _detect_mime(data)
        except PollinationsImageError as exc:
            if exc.status_code == 404:
                logger.info(
                    "Edit endpoint unavailable for %s, falling back to generate",
                    model_name,
                )
                enhanced = (
                    f"Edit the reference image: {prompt}. "
                    "Keep composition similar unless the edit requires change."
                )
                data = _pollinations_image_get(enhanced, model_name, width, height)
                return data, _detect_mime(data)
            raise

    return _run_image_chain(models, attempt)


def resolve_chain_image_edit() -> List[str]:
    from models.model_resolver import resolve_chain

    return resolve_chain("image_edit") or resolve_models(Capability.IMAGE)


def synthesize_speech(text: str, voice: Optional[str] = None) -> bytes:
    models = resolve_models(Capability.SPEECH)
    voice = voice or __import__("os").getenv("SPEECH_VOICE", "alloy")

    if not models:
        return b""

    last_error: Optional[Exception] = None
    for model_name in models:
        try:
            entry = model_def(model_name) or {}
            adapter = str(entry.get("adapter") or "")
            if adapter == "magpie_tts":
                if not model_is_available(model_name):
                    continue
                audio = synthesize_speech_for_model(model_name, text)
            elif model_name.startswith("pollinations/"):
                audio = _pollinations_speech(text, model_name, voice=voice)
            else:
                continue

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
