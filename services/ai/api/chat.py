from typing import List, Dict, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from memory.rag_service import RAGService
from models.streaming import stream_completion_sse

router = APIRouter()


class ChatStreamRequest(BaseModel):
    query: str
    rag_enabled: bool = True
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    user_id: Optional[str] = None
    preferred_model: Optional[str] = None


def build_chat_messages(
    chat_history: List[Dict[str, str]], context_str: str, query: str
) -> List[Dict[str, str]]:
    system_instruction = (
        "You are a helpful AI Assistant. Use retrieved context when relevant."
    )
    if context_str:
        system_instruction += f"\n\nRetrieved Context:\n{context_str}"

    formatted: List[Dict[str, str]] = [
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
    if not chat_history or chat_history[-1].get("content") != query:
        formatted.append({"role": "user", "content": query})
    return formatted


def _retrieve_context(query: str, user_id: Optional[str]) -> str:
    try:
        rag = RAGService()
        items = rag.search_context(query, limit=3, user_id=user_id)
        if items:
            return "\n".join(f"- {item['text']}" for item in items)
    except Exception as exc:
        print(f"RAG warning: {exc}")
    return ""


@router.post("/chat/stream")
async def chat_stream(payload: ChatStreamRequest):
    context_str = ""
    if payload.rag_enabled:
        context_str = _retrieve_context(payload.query, payload.user_id)

    messages = build_chat_messages(
        payload.chat_history, context_str, payload.query
    )

    async def generate():
        async for frame in stream_completion_sse(messages, payload.preferred_model):
            yield frame

    return StreamingResponse(
        generate(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
