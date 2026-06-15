import asyncio
import os
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from rag.rag_service import RAGService
from internal.observability import langfuse_span
from models.registry import get_models_catalog
from models import media
from models.transcription import get_transcription_provider
from voice_orchestration.voice_router import VoiceMode, VoiceRouter, VoiceSessionRequest
from agents.supervisor import run_agent
from api.chat import router as chat_router
from api.image_chat import router as image_chat_router
from api.providers import router as providers_router
from api.model_admin import router as model_admin_router

router = APIRouter()
router.include_router(chat_router)
router.include_router(image_chat_router)
router.include_router(providers_router)
router.include_router(model_admin_router)


class DocumentItem(BaseModel):
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class IngestRequest(BaseModel):
    documents: List[DocumentItem]
    user_id: Optional[str] = None


class MemoryIngestRequest(BaseModel):
    documents: List[DocumentItem]
    user_id: str


class MemoryExtractRequest(BaseModel):
    user_text: str
    assistant_text: str
    explicit_save: bool = False


class ShouldRetrieveRequest(BaseModel):
    query: str


class AgentRunRequest(BaseModel):
    agent_type: str
    task: str
    context: Dict[str, Any] = Field(default_factory=dict)
    user_id: Optional[str] = None


class SpeakRequest(BaseModel):
    text: str
    user_id: Optional[str] = None
    voice: Optional[str] = None


class LiveTokenRequest(BaseModel):
    user_id: str
    provider: Optional[str] = None


class ImageGenerateRequest(BaseModel):
    prompt: str
    width: int = 1024
    height: int = 1024
    user_id: Optional[str] = None


class ImageEditRequest(BaseModel):
    prompt: str
    source_image_base64: str
    mime_type: str = "image/jpeg"
    width: int = 1024
    height: int = 1024
    user_id: Optional[str] = None


@router.get("/models")
def list_models():
    return get_models_catalog()


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
async def kb_search(query: str, limit: int = 3, user_id: Optional[str] = None):
    try:
        rag = RAGService()
        results = await rag.search_context_async(query, limit, user_id=user_id)
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/memory/ingest")
def memory_ingest(payload: MemoryIngestRequest):
    import logging

    log = logging.getLogger(__name__)
    with langfuse_span("memory.ingest", user_id=payload.user_id):
        try:
            rag = RAGService()
            docs = [{"text": d.text, "metadata": d.metadata} for d in payload.documents]
            point_ids = rag.ingest_documents(docs, user_id=payload.user_id)
            return {"success": True, "ids": point_ids}
        except Exception as e:
            log.exception(
                "[memory] ingest failed user_id=%s doc_count=%d: %s",
                payload.user_id,
                len(payload.documents),
                e,
            )
            raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/memory/search")
async def memory_search(
    query: str,
    user_id: str,
    limit: int = 5,
    session_id: Optional[str] = None,
):
    import time

    t0 = time.perf_counter()
    try:
        from cache.embedding_cache import cache_stats

        rag = RAGService()
        results = await rag.search_context_async(
            query, limit, user_id=user_id, chat_session_id=session_id
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000
        stats = cache_stats()
        return {
            "success": True,
            "results": results,
            "timings": {"search_ms": round(elapsed_ms, 2), **stats},
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/memory/extract")
async def memory_extract(payload: MemoryExtractRequest):
    from memory.extraction import extract_facts

    facts = await extract_facts(
        payload.user_text,
        payload.assistant_text,
        explicit_save=payload.explicit_save,
    )
    return {"success": True, "facts": facts}


@router.post("/memory/should-retrieve")
async def memory_should_retrieve(payload: ShouldRetrieveRequest):
    from memory.extraction import should_retrieve_via_llm

    retrieve = await should_retrieve_via_llm(payload.query)
    return {"retrieve": retrieve}


@router.delete("/memory/session/{chat_session_id}")
def memory_delete_session(chat_session_id: str, user_id: str):
    rag = RAGService()
    deleted = rag.delete_session_vectors(user_id, chat_session_id)
    return {"success": True, "deleted": deleted}


@router.delete("/memory/points/{point_id}")
def memory_delete_point(point_id: str):
    rag = RAGService()
    ok = rag.delete_point(point_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Point not found or delete failed")
    return {"success": True}


@router.post("/agents/run")
def agents_run(payload: AgentRunRequest):
    with langfuse_span(
        "agent.executed",
        user_id=payload.user_id,
        metadata={"agent_type": payload.agent_type},
        input=payload.task,
    ):
        result = run_agent(payload.agent_type, payload.task, payload.context)
        return {"success": True, "result": result}


@router.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)):
    content = await file.read()
    name = file.filename or "audio.m4a"
    provider = get_transcription_provider()
    try:
        text = provider.transcribe(content, name)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"text": text}


@router.get("/voice/mode")
def voice_mode(user_id: Optional[str] = None):
    router_v = VoiceRouter()
    req = VoiceSessionRequest(user_id=user_id or "anonymous", platform="android")
    mode = router_v.route(req)
    return {
        "mode": mode.value,
        "available": ["classic"],
        "future_modes": [VoiceMode.FULL_DUPLEX.value],
        "full_duplex_available": router_v.full_duplex_available(),
        "pollinations_voice": router_v.pollinations_allowed(),
        "note": (
            "Classic: NVIDIA multimodal STT (gemma-3n) → integrate LLM → "
            "Magpie TTS or Pollinations fallback. "
            "full_duplex (nemotron-voicechat) is not implemented yet."
        ),
    }


@router.post("/voice/live/token")
def voice_live_token(_payload: LiveTokenRequest):
    router_v = VoiceRouter()
    if router_v.route(
        VoiceSessionRequest(user_id=_payload.user_id or "anonymous")
    ) == VoiceMode.FULL_DUPLEX:
        raise HTTPException(
            status_code=501,
            detail=(
                "nemotron-voicechat full-duplex is not available yet. "
                "Requires early access and a WebRTC/Pipecat stack."
            ),
        )
    raise HTTPException(
        status_code=501,
        detail="Live voice (Gemini/OpenAI realtime) is disabled. Use classic voice mode.",
    )


@router.post("/voice/speak")
async def voice_speak(payload: SpeakRequest):
    audio_bytes = await asyncio.to_thread(
        media.synthesize_speech, payload.text, voice=payload.voice
    )
    return StreamingResponse(
        iter([audio_bytes]),
        media_type="audio/mpeg",
    )


def _image_error_response(exc: Exception) -> JSONResponse:
    from models.media import ImageGenerationFailedError, PollinationsImageError

    if isinstance(exc, ImageGenerationFailedError):
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": exc.user_message,
                "code": exc.code,
                "retryAfterSeconds": exc.retry_after_seconds,
            },
        )
    if isinstance(exc, PollinationsImageError):
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": exc.user_message,
                "code": "quota_exceeded" if exc.is_quota else "image_failed",
                "retryAfterSeconds": exc.retry_after_seconds,
            },
        )
    return JSONResponse(
        status_code=502,
        content={
            "success": False,
            "error": str(exc),
            "code": "image_failed",
        },
    )


@router.post("/image/generate")
def image_generate(payload: ImageGenerateRequest):
    try:
        result = media.generate_image(
            payload.prompt,
            width=payload.width,
            height=payload.height,
        )
    except Exception as e:
        return _image_error_response(e)
    return StreamingResponse(
        iter([result.data]),
        media_type=result.mime_type,
    )


@router.post("/image/edit")
def image_edit(payload: ImageEditRequest):
    import base64

    try:
        source = base64.b64decode(payload.source_image_base64)
        result = media.edit_image(
            payload.prompt,
            source,
            width=payload.width,
            height=payload.height,
            mime_type=payload.mime_type,
        )
    except Exception as e:
        return _image_error_response(e)
    return StreamingResponse(
        iter([result.data]),
        media_type=result.mime_type,
    )
