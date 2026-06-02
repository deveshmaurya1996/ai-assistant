from __future__ import annotations

import base64
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from models import media
from models.media import ImageGenerationFailedError
from models.registry import label_for
from models.task_router import classify_image_intent

router = APIRouter()


class ImageFromChatRequest(BaseModel):
    query: str
    resolved_attachments: List[Dict[str, Any]] = Field(default_factory=list)
    width: int = 1024
    height: int = 1024


def _attachment_has_vision(att: Dict[str, Any]) -> bool:
    return bool(att.get("imageDataUrl") or att.get("embeddedImageDataUrls"))


def _first_image_bytes(resolved_attachments: List[Dict[str, Any]]) -> tuple[bytes, str]:
    for att in resolved_attachments:
        url = att.get("imageDataUrl")
        if url and str(url).startswith("data:"):
            header, _, b64 = str(url).partition(",")
            mime = "image/jpeg"
            if ";" in header:
                mime = header.split(";", 1)[0].replace("data:", "").strip() or mime
            return base64.b64decode(b64), mime
        for extra in att.get("embeddedImageDataUrls") or []:
            if extra and str(extra).startswith("data:"):
                header, _, b64 = str(extra).partition(",")
                mime = "image/jpeg"
                if ";" in header:
                    mime = header.split(";", 1)[0].replace("data:", "").strip() or mime
                return base64.b64decode(b64), mime
    raise ValueError("No image attachment found for edit")


def _extract_generation_prompt(query: str) -> str:
    q = query.strip()
    if not q:
        return "A beautiful scene"
    cleaned = re.sub(
        r"^(please\s+)?(can you\s+)?(generate|create|draw|make|design|render|paint)\s+(an?\s+)?(image|picture|photo|illustration)\s+(of\s+)?",
        "",
        q,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned or q


@router.post("/image/from-chat")
def image_from_chat(payload: ImageFromChatRequest):
    has_images = any(_attachment_has_vision(a) for a in payload.resolved_attachments)
    intent = classify_image_intent(payload.query, has_image_attachment=has_images)
    if not intent:
        raise HTTPException(status_code=400, detail="Not an image generation or edit request")

    try:
        if intent == "image_edit":
            if not has_images:
                raise HTTPException(
                    status_code=400,
                    detail="Image edit requires an attached image",
                )
            source_bytes, mime_type = _first_image_bytes(payload.resolved_attachments)
            prompt = _extract_generation_prompt(payload.query) or payload.query.strip()
            result = media.edit_image(
                prompt,
                source_bytes,
                width=payload.width,
                height=payload.height,
                mime_type=mime_type,
            )
            caption = "Here's your edited image."
        else:
            prompt = _extract_generation_prompt(payload.query)
            result = media.generate_image(
                prompt,
                width=payload.width,
                height=payload.height,
            )
            caption = "Here's your image."

        return {
            "success": True,
            "caption": caption,
            "imageBase64": base64.b64encode(result.data).decode("ascii"),
            "mimeType": result.mime_type,
            "modelUsed": result.model_used,
            "modelLabel": label_for(result.model_used),
        }
    except ImageGenerationFailedError as exc:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": exc.user_message,
                "code": exc.code,
                "retryAfterSeconds": exc.retry_after_seconds,
            },
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "Image generation failed. Please try again later.",
                "code": "image_failed",
            },
        )
