import logging
import re
import time
from typing import Any, List, Dict, Optional, Union

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from memory.rag_service import RAGService
from models.registry import get_models_catalog, get_rag_config, label_for, model_is_available
from models.streaming import stream_completion_sse
from models.streaming.completion import complete_text
from models.streaming.title import generate_chat_title
from models.task_router import classify_task, is_rag_relevant_query
from observability import get_langfuse
from api.attachment_content import (
    collect_vision_urls,
    user_content_from_attachments as _user_content_from_attachments,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatStreamRequest(BaseModel):
    query: str
    rag_enabled: bool = False
    retrieved_context: Optional[str] = None
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    user_id: Optional[str] = None
    task: Optional[str] = "auto"
    attachments: List[Dict[str, Any]] = Field(default_factory=list)
    resolved_attachments: List[Dict[str, Any]] = Field(default_factory=list)
    personality_id: Optional[str] = None
    assistant_display_name: Optional[str] = None
    system_prompt: Optional[str] = None


class ChatCompleteRequest(BaseModel):
    query: str
    rag_enabled: bool = False
    retrieved_context: Optional[str] = None
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    user_id: Optional[str] = None
    task: Optional[str] = "auto"
    attachments: List[Dict[str, Any]] = Field(default_factory=list)
    resolved_attachments: List[Dict[str, Any]] = Field(default_factory=list)
    personality_id: Optional[str] = None
    assistant_display_name: Optional[str] = None
    system_prompt: Optional[str] = None


class ChatTitleRequest(BaseModel):
    user_message: str
    assistant_message: str


ChatMessage = Dict[str, Any]


def _attachment_has_vision_payload(resolved_attachments: List[Dict[str, Any]]) -> bool:
    return bool(collect_vision_urls(resolved_attachments))


def resolve_task_for_payload(
    query: str,
    explicit_task: Optional[str],
    resolved_attachments: List[Dict[str, Any]],
) -> str:
    """Route attachment turns: vision → file_analysis; text-only docs → fast_chat."""
    if explicit_task and explicit_task.strip() not in (
        "",
        "auto",
        "fast_chat",
        "reasoning",
        "file_analysis",
    ):
        return explicit_task.strip()

    if resolved_attachments:
        if _attachment_has_vision_payload(resolved_attachments):
            return "file_analysis"
        if any(a.get("textExcerpt") or a.get("note") for a in resolved_attachments):
            return "fast_chat"

    return classify_task(query, explicit_task)


def build_chat_messages(
    chat_history: List[Dict[str, str]],
    context_str: str,
    query: str,
    resolved_attachments: Optional[List[Dict[str, Any]]] = None,
    system_prompt: Optional[str] = None,
) -> List[ChatMessage]:
    resolved_attachments = resolved_attachments or []
    if system_prompt and system_prompt.strip():
        system_instruction = system_prompt.strip()
        system_instruction += (
            " Past retrieved snippets or earlier assistant replies may be outdated; "
            "your name and identity are defined in this system message only."
        )
    else:
        system_instruction = "You are a helpful AI Assistant."
    system_instruction += " Use retrieved context when relevant."
    if system_prompt and system_prompt.strip():
        name_match = re.search(
            r"Your name is ([^.]+)\.", system_prompt.strip(), re.IGNORECASE
        )
        if name_match:
            identity_name = name_match.group(1).strip()
            system_instruction += (
                f" Identity reminder: you are {identity_name}. "
                f"If asked your name, answer: My name is {identity_name}."
            )
    if context_str:
        system_instruction += f"\n\nRetrieved Context:\n{context_str}"
    if resolved_attachments:
        system_instruction += (
            "\n\nThe user may attach files or images. Use the attachment "
            "content in their message when answering."
        )

    formatted: List[ChatMessage] = [
        {"role": "system", "content": system_instruction}
    ]
    for msg in chat_history:
        if msg.get("role") != "system":
            formatted.append(
                {
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", ""),
                }
            )

    user_content = _user_content_from_attachments(query, resolved_attachments)
    should_append = True
    if chat_history:
        last = chat_history[-1]
        if last.get("role") == "user":
            last_plain = (last.get("content") or "").strip()
            query_plain = query.strip()
            if resolved_attachments:
                # Merge multimodal content into the latest user turn (history is text-only).
                if formatted and formatted[-1].get("role") == "user":
                    formatted[-1] = {"role": "user", "content": user_content}
                should_append = False
            elif last_plain == query_plain:
                should_append = False
    if should_append:
        formatted.append({"role": "user", "content": user_content})
    return formatted


async def _retrieve_context(query: str, user_id: Optional[str]) -> str:
    t0 = time.perf_counter()
    try:
        rag = RAGService()
        cfg = get_rag_config()
        items = await rag.search_context_async(
            query, limit=int(cfg.get("limit", 3)), user_id=user_id
        )
        if items:
            logger.info(
                "[chat] rag_ms=%.0f hits=%d",
                (time.perf_counter() - t0) * 1000,
                len(items),
            )
            return "\n".join(f"- {item['text']}" for item in items)
    except Exception as exc:
        logger.warning("[chat] rag failed: %s", exc)
    return ""


async def _resolve_context(payload: ChatStreamRequest | ChatCompleteRequest) -> str:
    if payload.retrieved_context:
        return payload.retrieved_context.strip()
    if not payload.rag_enabled:
        return ""
    if not is_rag_relevant_query(payload.query) and payload.task in (None, "auto", "fast_chat"):
        return ""
    return await _retrieve_context(payload.query, payload.user_id)


@router.get("/chat/diagnostics")
async def chat_diagnostics():
    from models.config_loader import load_ai_models_config

    load_ai_models_config(reload=True)
    catalog = get_models_catalog()
    rag = RAGService()
    return {
        "mode": "auto",
        "catalog": catalog,
        "providers": {
            "nvidia": model_is_available("nvidia/nemotron-mini-4b-instruct"),
            "pollinations": model_is_available("pollinations/openai"),
        },
        "note": (
            "Production tiers: A=GLM 5.1+Mistral Nemotron+NV-Embed+Rerank; "
            "B=Nemotron Mini+Gemma 3n; C=PaliGemma+Llama Maverick (images only). "
            "Pollinations fallback when keys missing."
        ),
        "rag": get_rag_config(),
        "embedder": get_rag_config().get("providerModel", "nvidia/nv-embed-v1"),
    }


@router.post("/chat/title")
def chat_title(payload: ChatTitleRequest):
    title = generate_chat_title(payload.user_message, payload.assistant_message)
    return {"title": title}


@router.post("/chat/stream")
async def chat_stream(payload: ChatStreamRequest):
    t0 = time.perf_counter()
    context_str = await _resolve_context(payload)
    resolved_task = resolve_task_for_payload(
        payload.query, payload.task, payload.resolved_attachments
    )
    messages = build_chat_messages(
        payload.chat_history,
        context_str,
        payload.query,
        payload.resolved_attachments,
        payload.system_prompt,
    )
    logger.info(
        "[chat] stream_start task=%s rag=%s context_chars=%d personality=%s",
        resolved_task,
        bool(context_str),
        len(context_str),
        payload.personality_id or "default",
    )

    async def generate():
        langfuse = get_langfuse()
        trace_obj = None
        if langfuse:
            trace_obj = langfuse.trace(
                name="chat.stream",
                user_id=payload.user_id,
                input=payload.query,
                metadata={"rag_enabled": payload.rag_enabled, "task": resolved_task},
            )
        try:
            async for frame in stream_completion_sse(messages, resolved_task):
                yield frame
        finally:
            logger.info("[chat] stream_end total_ms=%.0f", (time.perf_counter() - t0) * 1000)
            if trace_obj:
                trace_obj.end()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/complete")
async def chat_complete(payload: ChatCompleteRequest):
    context_str = await _resolve_context(payload)
    resolved_task = resolve_task_for_payload(
        payload.query, payload.task, payload.resolved_attachments
    )
    messages = build_chat_messages(
        payload.chat_history,
        context_str,
        payload.query,
        payload.resolved_attachments,
        payload.system_prompt,
    )
    text, model_used = await complete_text(messages, resolved_task)
    return {
        "text": text,
        "model_used": model_used,
        "model_label": label_for(model_used) if model_used else None,
        "task": resolved_task,
        "rag_enabled": payload.rag_enabled,
    }
