import logging
import os
from urllib.error import URLError
from urllib.request import urlopen

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
from models.registry import get_models_catalog, log_startup_summary

logger = logging.getLogger(__name__)

app = FastAPI(title="AI Assistant Orchestration Layer")
app.add_middleware(TraceContextMiddleware)
instrument_fastapi(app)

app.include_router(api_router, prefix="/v1")


@app.on_event("startup")
def on_startup():
    log_startup_summary()
    catalog = get_models_catalog()
    for cap, info in catalog["capabilities"].items():
        if not info.get("chain"):
            logger.warning(
                "Capability %s has no available models — check API keys in .env",
                cap,
            )


@app.get("/")
def read_root():
    return {"status": "AI Orchestration Layer is running"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai"}


@app.get("/health/ready")
def health_ready():
    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333").rstrip("/")
    try:
        with urlopen(f"{qdrant_url}/readyz", timeout=3) as resp:
            if resp.status == 200:
                return {"status": "ready", "qdrant": "ok"}
    except (URLError, TimeoutError, OSError) as err:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "qdrant": "error",
                "message": str(err),
            },
        )
    return JSONResponse(
        status_code=503,
        content={"status": "degraded", "qdrant": "unavailable"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
