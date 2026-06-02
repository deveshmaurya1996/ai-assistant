
from __future__ import annotations

import json
from typing import Any, AsyncIterator, Dict, List

import httpx

from models.config_loader import model_def
from models.providers.nvidia_integrate import model_default_params, nvidia_api_key

_MAX_IMAGE_B64_CHARS = 180_000


class VlmNoImageError(RuntimeError):
    """Raised when a VLM model is invoked without image content."""


def vlm_endpoint_url(model_id: str) -> str:
    entry = model_def(model_id) or {}
    explicit = str(entry.get("endpointUrl") or "").strip().rstrip("/")
    if explicit:
        return explicit
    provider_model = str(entry.get("providerModel") or model_id)
    return f"https://ai.api.nvidia.com/v1/vlm/{provider_model}"


def _last_user_message(messages: List[Dict[str, Any]]) -> Dict[str, Any] | None:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return msg
    return None


def messages_to_vlm_content(messages: List[Dict[str, Any]]) -> str:
    """Build PaliGemma-style HTML content from OpenAI multimodal user parts."""
    user = _last_user_message(messages)
    if not user:
        raise VlmNoImageError("No user message for VLM")

    content = user.get("content")
    text_parts: List[str] = []
    img_tags: List[str] = []

    if isinstance(content, str):
        text_parts.append(content.strip())
    elif isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "text":
                text = str(part.get("text", "")).strip()
                if text:
                    text_parts.append(text)
            elif part.get("type") == "image_url":
                url = str((part.get("image_url") or {}).get("url", "")).strip()
                if not url:
                    continue
                if url.startswith("data:"):
                    b64_part = url.split(",", 1)[-1]
                    if len(b64_part) > _MAX_IMAGE_B64_CHARS:
                        raise ValueError(
                            "Image too large for NVIDIA VLM; use assets API for larger uploads"
                        )
                img_tags.append(f'<img src="{url}" />')

    if not img_tags:
        raise VlmNoImageError("VLM requires at least one image")

    prompt = "\n\n".join(text_parts).strip() if text_parts else "Describe the image."
    return f"{prompt} {' '.join(img_tags)}".strip()


def build_vlm_payload(
    messages: List[Dict[str, Any]],
    model_id: str,
    *,
    stream: bool,
) -> Dict[str, Any]:
    params = model_default_params(model_id)
    payload: Dict[str, Any] = {
        "messages": [
            {
                "role": "user",
                "content": messages_to_vlm_content(messages),
            }
        ],
        "max_tokens": int(params.get("max_tokens", 512)),
        "temperature": float(params.get("temperature", 1.0)),
        "top_p": float(params.get("top_p", 0.7)),
        "stream": stream,
    }
    for key in ("frequency_penalty", "presence_penalty"):
        if params.get(key) is not None:
            payload[key] = params[key]
    return payload


def _headers(*, stream: bool) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {nvidia_api_key()}",
        "Accept": "text/event-stream" if stream else "application/json",
        "Content-Type": "application/json",
    }


def _extract_stream_delta(line: str) -> str:
    if not line.startswith("data:"):
        return ""
    data = line[5:].strip()
    if not data or data == "[DONE]":
        return ""
    try:
        obj = json.loads(data)
    except json.JSONDecodeError:
        return ""
    choices = obj.get("choices") or []
    if not choices:
        return ""
    choice = choices[0]
    delta = choice.get("delta") or {}
    if delta.get("content"):
        return str(delta["content"])
    message = choice.get("message") or {}
    if message.get("content"):
        return str(message["content"])
    return ""


def _extract_completion_text(body: Dict[str, Any]) -> str:
    choices = body.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    return str(message.get("content", "")).strip()


async def complete_vlm(
    messages: List[Dict[str, Any]],
    model_id: str,
    *,
    timeout: float,
) -> str:
    url = vlm_endpoint_url(model_id)
    payload = build_vlm_payload(messages, model_id, stream=False)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=_headers(stream=False), json=payload)
        if response.status_code >= 400:
            raise RuntimeError(
                f"NVIDIA VLM failed ({response.status_code}): {response.text[:300]}"
            )
        return _extract_completion_text(response.json())


async def iter_vlm_tokens(
    messages: List[Dict[str, Any]],
    model_id: str,
    *,
    timeout: float,
) -> AsyncIterator[str]:
    url = vlm_endpoint_url(model_id)
    payload = build_vlm_payload(messages, model_id, stream=True)
    connect_timeout = min(timeout, 35.0)
    chunk_timeout = min(timeout, 45.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            url,
            headers=_headers(stream=True),
            json=payload,
            timeout=connect_timeout,
        ) as response:
            if response.status_code >= 400:
                body = await response.aread()
                raise RuntimeError(
                    f"NVIDIA VLM failed ({response.status_code}): {body[:300]!r}"
                )
            async for line in response.aiter_lines():
                delta = _extract_stream_delta(line)
                if delta:
                    yield delta


def is_nvidia_vlm_model(model_id: str) -> bool:
    entry = model_def(model_id) or {}
    return str(entry.get("adapter") or "") == "nvidia_vlm"
