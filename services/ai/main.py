from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

_root = Path(__file__).resolve().parents[2]
load_dotenv(_root / ".env")

from api.router import router as api_router

app = FastAPI(title="AI Assistant Orchestration Layer")

app.include_router(api_router, prefix="/v1")

@app.get("/")
def read_root():
    return {"status": "AI Orchestration Layer is running"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
