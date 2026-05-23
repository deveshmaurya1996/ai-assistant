import os
import asyncio
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from memory.rag_service import RAGService
from models.router import stream_completion
from agents.supervisor import run_agent

router = APIRouter()


class DocumentItem(BaseModel):
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class IngestRequest(BaseModel):
    documents: List[DocumentItem]
    user_id: Optional[str] = None


class MemoryIngestRequest(BaseModel):
    documents: List[DocumentItem]
    user_id: str


class ChatStreamRequest(BaseModel):
    query: str
    rag_enabled: bool = True
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    user_id: Optional[str] = None
    preferred_model: Optional[str] = None


class AgentRunRequest(BaseModel):
    agent_type: str
    task: str
    context: Dict[str, Any] = Field(default_factory=dict)
    user_id: Optional[str] = None


class SpeakRequest(BaseModel):
    text: str
    user_id: Optional[str] = None


def _build_messages(
    chat_history: List[Dict[str, str]], context_str: str, query: str
) -> List[Dict[str, str]]:
    system_instruction = (
        "You are a helpful AI Assistant. Use retrieved context when relevant."
    )
    if context_str:
        system_instruction += f"\n\nRetrieved Context:\n{context_str}"

    formatted = [{"role": "system", "content": system_instruction}]
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


@router.post("/kb/ingest")
def kb_ingest(payload: IngestRequest):
    try:
        rag = RAGService()
        docs = [{"text": d.text, "metadata": d.metadata} for d in payload.documents]
        point_ids = rag.ingest_documents(docs, user_id=payload.user_id)
        return {"success": True, "ids": point_ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/kb/search")
def kb_search(query: str, limit: int = 3, user_id: Optional[str] = None):
    try:
        rag = RAGService()
        results = rag.search_context(query, limit, user_id=user_id)
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/memory/ingest")
def memory_ingest(payload: MemoryIngestRequest):
    try:
        rag = RAGService()
        docs = [{"text": d.text, "metadata": d.metadata} for d in payload.documents]
        point_ids = rag.ingest_documents(docs, user_id=payload.user_id)
        return {"success": True, "ids": point_ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memory/search")
def memory_search(query: str, user_id: str, limit: int = 5):
    try:
        rag = RAGService()
        results = rag.search_context(query, limit, user_id=user_id)
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream")
def chat_stream(payload: ChatStreamRequest):
    context_str = ""
    if payload.rag_enabled:
        try:
            rag = RAGService()
            items = rag.search_context(
                payload.query, limit=3, user_id=payload.user_id
            )
            if items:
                context_str = "\n".join(
                    f"- {item['text']}" for item in items
                )
        except Exception as e:
            print(f"RAG warning: {e}")

    messages = _build_messages(payload.chat_history, context_str, payload.query)

    async def generate():
        async for chunk in stream_completion(messages, payload.preferred_model):
            yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/agents/run")
def agents_run(payload: AgentRunRequest):
    result = run_agent(payload.agent_type, payload.task, payload.context)
    return {"success": True, "result": result}


@router.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)):
    content = await file.read()
    text = f"[Transcription placeholder for {len(content)} bytes of audio]"
    if os.getenv("OPENAI_API_KEY"):
        try:
            import tempfile
            import litellm

            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                tmp.write(content)
                tmp.flush()
                response = litellm.transcription(
                    model="whisper-1",
                    file=open(tmp.name, "rb"),
                )
                text = response.text
        except Exception as e:
            text = f"[Whisper error: {e}]"
    return {"text": text}


@router.post("/voice/speak")
async def voice_speak(payload: SpeakRequest):
    audio_bytes = b""
    if os.getenv("OPENAI_API_KEY"):
        try:
            import litellm

            response = litellm.speech(
                model="tts-1",
                input=payload.text,
                voice="alloy",
            )
            audio_bytes = response.content
        except Exception:
            audio_bytes = b""
    return StreamingResponse(
        iter([audio_bytes]),
        media_type="audio/mpeg",
    )
