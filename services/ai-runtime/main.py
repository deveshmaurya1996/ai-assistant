import logging
import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from env_loader import load_monorepo_env
from observability import init_observability, instrument_fastapi

load_monorepo_env()
init_observability()


class TraceContextMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            from opentelemetry import trace
            from opentelemetry.propagate import extract

            headers = {
                k.decode().lower(): v.decode()
                for k, v in scope.get("headers", [])
            }
            ctx = extract(headers)
            token = trace.context_api.attach(ctx)
            try:
                await self.app(scope, receive, send)
            finally:
                trace.context_api.detach(token)
        except Exception:
            await self.app(scope, receive, send)

from api.router import router as api_router
from memory.rag_service import RAGService
from models.config_loader import get_rag_config, load_ai_models_config
from models.voice import FFMPEG_INSTALL_HINT, ensure_ffmpeg_on_path, ffmpeg_available
from models.registry import get_models_catalog, log_startup_summary

logger = logging.getLogger(__name__)

app = FastAPI(title="AI Assistant Orchestration Layer")
app.add_middleware(TraceContextMiddleware)
instrument_fastapi(app)

app.include_router(api_router, prefix="/v1")


@app.on_event("startup")
async def on_startup():
    load_ai_models_config(reload=True)
    log_startup_summary()
    if ensure_ffmpeg_on_path():
        logger.info("[voice] ffmpeg available for transcription preprocessing")
    else:
        logger.warning("[voice] ffmpeg not found — %s", FFMPEG_INSTALL_HINT)
    catalog = get_models_catalog()
    for task, chain in catalog.get("taskChains", {}).items():
        if not chain:
            logger.warning(
                "Task %s has no available models — check API keys in .env",
                task,
            )
    rag_cfg = get_rag_config()
    if rag_cfg.get("warmEmbedderOnStartup", True):
        try:
            await RAGService.warm_embedder()
        except Exception as exc:
            logger.warning("[rag] warm embedder failed: %s", exc)


@app.get("/")
def read_root():
    return {"status": "AI Orchestration Layer is running"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai"}


@app.get("/health/ready")
def health_ready():
    qdrant_url = os.getenv("QDRANT_URL", "").strip()
    if not qdrant_url:
        return {"status": "ready", "qdrant": "local"}
    try:
        from memory.rag_service import _qdrant_client_from_env

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
