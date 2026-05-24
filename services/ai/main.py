from pathlib import Path
import logging

from dotenv import load_dotenv
from fastapi import FastAPI

_root = Path(__file__).resolve().parents[2]
load_dotenv(_root / ".env")

from api.router import router as api_router
from models.registry import get_models_catalog, log_startup_summary

logger = logging.getLogger(__name__)

app = FastAPI(title="AI Assistant Orchestration Layer")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
