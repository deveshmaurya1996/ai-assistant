import os
from pathlib import Path

from dotenv import load_dotenv


def find_monorepo_root() -> Path:
    current = Path(__file__).resolve().parent
    for parent in [current, *current.parents]:
        if (parent / "pnpm-workspace.yaml").exists():
            return parent
    return Path(__file__).resolve().parents[2]


def resolve_env_file(root: Path) -> Path | None:
    explicit = os.getenv("ENV_FILE", "").strip()
    if explicit:
        path = Path(explicit) if Path(explicit).is_absolute() else root / explicit
        return path if path.exists() else None

    production = os.getenv("NODE_ENV") == "production" or os.getenv("RENDER") == "true"
    prod_path = root / ".env.production"
    local_path = root / ".env"

    if production and prod_path.exists():
        return prod_path
    if local_path.exists():
        return local_path
    if prod_path.exists():
        return prod_path
    return None


_env_loaded = False


def load_service_env() -> None:
    global _env_loaded
    if _env_loaded:
        return
    root = find_monorepo_root()
    env_path = resolve_env_file(root)
    if env_path:
        load_dotenv(env_path)
    _env_loaded = True


def _ensure_env() -> None:
    if not _env_loaded:
        load_service_env()


def _public_api_url_from_env() -> str:
    raw = (
        os.getenv("API_PUBLIC_URL", "").strip()
        or os.getenv("GATEWAY_URL", "").strip()
    )
    if raw:
        return raw.rstrip("/")
    port = os.getenv("API_PORT", "3000")
    return f"http://localhost:{port}"


def resolve_public_api_url() -> str:
    _ensure_env()
    return _public_api_url_from_env()


def resolve_tool_runtime_url() -> str:
    _ensure_env()
    explicit = os.getenv("TOOL_RUNTIME_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    return f"{resolve_public_api_url()}/internal/tools"


def resolve_capability_runtime_url() -> str:
    _ensure_env()
    explicit = os.getenv("CAPABILITY_RUNTIME_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    return f"{resolve_public_api_url()}/internal/capabilities"


def _embedded_in_ai_runtime() -> bool:
    return os.getenv("COGNITIVE_EMBEDDED", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def resolve_ai_service_url() -> str:
    _ensure_env()
    explicit = (
        os.getenv("INTELLIGENCE_UPSTREAM_URL", "").strip()
        or os.getenv("AI_SERVICE_URL", "").strip()
    )
    if explicit:
        return explicit.rstrip("/")
    if _embedded_in_ai_runtime():
        port = os.getenv("AI_PORT", os.getenv("PORT", "8000"))
        return f"http://localhost:{port}"
    return "http://localhost:8000"
