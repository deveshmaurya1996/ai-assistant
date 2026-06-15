
from __future__ import annotations

import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])

_LIVENESS_BODY = {
    "status": "ok",
    "service": "intelligence",
    "ai": True,
    "cognitive": True,
}


@router.get("/")
def read_root() -> dict[str, str]:
    return {"status": "AI Orchestration Layer is running"}


@router.head("/")
def read_root_head() -> JSONResponse:
    return JSONResponse(content=None, status_code=200)


@router.get("/health")
def health() -> dict[str, object]:
    return _LIVENESS_BODY


@router.head("/health")
def health_head() -> JSONResponse:
    return JSONResponse(content=None, status_code=200)


@router.get("/health/ready")
def health_ready():
    qdrant_url = os.getenv("QDRANT_URL", "").strip()
    if not qdrant_url:
        return {"status": "ready", "qdrant": "local"}

    try:
        from rag.rag_service import _qdrant_client_from_env

        client = _qdrant_client_from_env()
        client.get_collections()
        return {"status": "ready", "qdrant": "ok"}
    except Exception as err:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "qdrant": "error",
                "message": str(err),
            },
        )
