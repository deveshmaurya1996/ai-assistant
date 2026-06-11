from __future__ import annotations

import importlib.util
import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI

logger = logging.getLogger(__name__)

_COGNITIVE_MOUNTED = False


def mount_cognitive_routes(app: FastAPI) -> None:
    global _COGNITIVE_MOUNTED
    if _COGNITIVE_MOUNTED:
        return

    cognitive_dir = Path(__file__).resolve().parent.parent / "cognitive-runtime"
    main_path = cognitive_dir / "main.py"
    if not main_path.is_file():
        logger.warning("[intelligence] cognitive-runtime not found at %s", main_path)
        return

    cog_root = str(cognitive_dir)
    if cog_root not in sys.path:
        sys.path.insert(0, cog_root)

    os.environ.setdefault("COGNITIVE_EMBEDDED", "1")

    import importlib

    ai_http = importlib.import_module("ai_http")
    ai_http.set_embedded_parent_app(app)

    spec = importlib.util.spec_from_file_location("cognitive_runtime_main", main_path)
    if spec is None or spec.loader is None:
        logger.warning("[intelligence] failed to load cognitive-runtime spec")
        return

    module = importlib.util.module_from_spec(spec)
    sys.modules["cognitive_runtime_main"] = module
    spec.loader.exec_module(module)

    cognitive_app: FastAPI = module.app
    skip_paths = {"/health", "/openapi.json", "/docs", "/redoc"}

    for route in cognitive_app.routes:
        path = getattr(route, "path", None)
        if path in skip_paths:
            continue
        app.router.routes.append(route)

    _COGNITIVE_MOUNTED = True
    logger.info("[intelligence] mounted cognitive-runtime routes")
