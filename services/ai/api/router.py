from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from memory.rag_service import RAGService
from models.registry import get_models_catalog
from models import media
from agents.supervisor import run_agent
from api.chat import router as chat_router

router = APIRouter()
router.include_router(chat_router)


class DocumentItem(BaseModel):
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class IngestRequest(BaseModel):
    documents: List[DocumentItem]
    user_id: Optional[str] = None


class MemoryIngestRequest(BaseModel):
    documents: List[DocumentItem]
    user_id: str


class AgentRunRequest(BaseModel):
    agent_type: str
    task: str
    context: Dict[str, Any] = Field(default_factory=dict)
    user_id: Optional[str] = None


class SpeakRequest(BaseModel):
    text: str
    user_id: Optional[str] = None
    voice: Optional[str] = None


class ImageGenerateRequest(BaseModel):
    prompt: str
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


@router.post("/agents/run")
def agents_run(payload: AgentRunRequest):
    result = run_agent(payload.agent_type, payload.task, payload.context)
    return {"success": True, "result": result}


@router.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)):
    content = await file.read()
    name = file.filename or "audio.m4a"
    try:
        text = media.transcribe_audio(content, name)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"text": text}


@router.post("/voice/speak")
async def voice_speak(payload: SpeakRequest):
    audio_bytes = media.synthesize_speech(payload.text, voice=payload.voice)
    return StreamingResponse(
        iter([audio_bytes]),
        media_type="audio/mpeg",
    )


@router.post("/image/generate")
def image_generate(payload: ImageGenerateRequest):
    try:
        image_bytes = media.generate_image(
            payload.prompt,
            width=payload.width,
            height=payload.height,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return StreamingResponse(iter([image_bytes]), media_type="image/jpeg")
