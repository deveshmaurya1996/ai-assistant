
from pathlib import Path

from dotenv import load_dotenv


def find_monorepo_root() -> Path:
    current = Path(__file__).resolve().parent
    for parent in [current, *current.parents]:
        if (parent / "pnpm-workspace.yaml").exists():
            return parent
    return Path(__file__).resolve().parents[2]


def load_monorepo_env() -> None:
    root = find_monorepo_root()
    env_path = root / ".env"
    if env_path.exists():
        load_dotenv(env_path)
