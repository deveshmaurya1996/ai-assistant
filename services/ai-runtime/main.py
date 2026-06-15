import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from api.health import router as health_router
from env_loader import load_monorepo_env
from internal.bootstrap import RuntimeBootstrap
from internal.observability import init_observability, instrument_fastapi
from request_id_middleware import RequestIdLogFilter, RequestIdMiddleware

load_monorepo_env()
init_observability()

logger = logging.getLogger(__name__)
bootstrap = RuntimeBootstrap()

INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await bootstrap.start(app)
    yield
    await bootstrap.shutdown()
    logger.info("[intelligence] shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI Assistant Intelligence Runtime",
        lifespan=lifespan,
    )
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(TraceContextMiddleware)
    instrument_fastapi(app)
    app.include_router(health_router)
    logging.getLogger().addFilter(RequestIdLogFilter())

    @app.middleware("http")
    async def internal_auth_middleware(request, call_next):
        if "/internal/" in request.url.path:
            header = request.headers.get("x-internal-token")
            if header != INTERNAL_SERVICE_TOKEN:
                return JSONResponse(status_code=403, content={"error": "Forbidden"})
        return await call_next(request)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("INTELLIGENCE_HOST", "localhost")
    port = int(os.getenv("AI_PORT", os.getenv("PORT", "8000")))
    uvicorn.run("main:app", host=host, port=port, reload=True)
