
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import suppress

from fastapi import FastAPI

logger = logging.getLogger(__name__)


async def _run_deferred_warmup() -> None:
    from models.config_loader import get_rag_config
    from rag.rag_service import RAGService

    rag_cfg = get_rag_config()
    if rag_cfg.get("warmEmbedderOnStartup", True):
        try:
            await RAGService.warm_embedder()
        except Exception as exc:
            logger.warning("[rag] warm embedder failed: %s", exc)

    if os.getenv("HEALTH_PROBE_ON_STARTUP", "false").lower() in ("1", "true", "yes"):
        from internal.diagnostics import probe_providers_once

        try:
            await probe_providers_once()
        except Exception as exc:
            logger.warning("[health-probe] startup probe failed: %s", exc)

    if os.getenv("WARM_AGENT_MODULES", "true").lower() in ("1", "true", "yes"):
        try:
            from api.agent import warm_agent_modules

            warm_agent_modules()
            logger.info("[intelligence] agent orchestration modules warmed")
        except Exception as exc:
            logger.warning("[intelligence] agent warm import failed: %s", exc)
    else:
        logger.info("[intelligence] agent module warmup skipped (WARM_AGENT_MODULES=false)")

    try:
        from llm.health_monitor import start_health_monitor_loops

        await start_health_monitor_loops()
    except Exception as exc:
        logger.warning("[health-probe] monitor start failed: %s", exc)

    try:
        from api.model_admin import start_daily_capability_probes

        await start_daily_capability_probes()
    except Exception as exc:
        logger.warning("[cap-probe] daily probe start failed: %s", exc)


async def _mount_api_routes(app: FastAPI) -> None:
    from api.agent import router as agent_router
    from api.router import router as api_router
    from models.config_loader import load_ai_models_config
    from models.registry import get_models_catalog, log_startup_summary
    from models.voice import FFMPEG_INSTALL_HINT, ensure_ffmpeg_on_path

    app.include_router(api_router, prefix="/v1")
    app.include_router(agent_router)

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

    logger.info("[intelligence] API routes mounted")


class RuntimeBootstrap:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None

    async def start(self, app: FastAPI) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run(app), name="intelligence-bootstrap")

    async def shutdown(self) -> None:
        if self._task is None or self._task.done():
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def _run(self, app: FastAPI) -> None:
        try:
            await _mount_api_routes(app)
            await _run_deferred_warmup()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[intelligence] bootstrap failed")
            raise
