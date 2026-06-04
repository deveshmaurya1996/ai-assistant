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


def load_service_env() -> None:
    root = find_monorepo_root()
    env_path = resolve_env_file(root)
    if env_path:
        load_dotenv(env_path)


def resolve_public_api_url() -> str:
    for key in ("API_PUBLIC_URL", "GATEWAY_URL", "API_URL", "BETTER_AUTH_URL"):
        raw = os.getenv(key, "").strip()
        if raw:
            return raw.rstrip("/")
    return "http://localhost:3000"
