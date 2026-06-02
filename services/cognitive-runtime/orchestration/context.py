
import logging
import os
from typing import Dict, List, Optional, Set, Tuple

import httpx

logger = logging.getLogger(__name__)

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")
GATEWAY_URL = os.getenv(
    "GATEWAY_URL", os.getenv("API_URL", os.getenv("BETTER_AUTH_URL", "http://localhost:3050"))
)
SKILL_RUNTIME_URL = os.getenv("SKILL_RUNTIME_URL", "http://localhost:3014")
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")
MAX_HISTORY = 20
RAG_TIMEOUT = float(os.getenv("RAG_TIMEOUT_SECONDS", "5"))


def is_rag_globally_enabled() -> bool:
    raw = os.getenv("RAG_ENABLED", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


def merge_context_blocks(*parts: str) -> str:
    return "\n\n".join(p.strip() for p in parts if p and p.strip())


async def fetch_integration_manifest(
    user_id: str,
) -> Tuple[str, Set[str], List[Dict]]:
    headers = {"X-Internal-Token": INTERNAL_SERVICE_TOKEN}
    endpoints = [
        (GATEWAY_URL, "/internal/integrations/manifest", headers),
        (SKILL_RUNTIME_URL, "/v1/integrations/manifest", {}),
    ]

    for base, path, hdrs in endpoints:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(
                    f"{base}{path}",
                    params={"userId": user_id},
                    headers=hdrs,
                )
                if res.status_code != 200:
                    continue
                data = res.json()
                text = str(data.get("plannerText", "")).strip()
                caps = {
                    c["id"]
                    for c in (data.get("manifest") or {}).get("capabilities", [])
                    if isinstance(c, dict) and c.get("id")
                }
                connections = data.get("connections") or []
                if isinstance(connections, list):
                    return text, caps, connections
                return text, caps, []
        except Exception:
            continue

    return "", set(), []


async def fetch_rag_context(
    query: str,
    user_id: str,
    *,
    limit: int = 3,
) -> str:
    try:
        async with httpx.AsyncClient(timeout=RAG_TIMEOUT) as client:
            res = await client.get(
                f"{AI_SERVICE_URL}/v1/kb/search",
                params={"query": query, "limit": limit, "user_id": user_id},
            )
            if res.status_code != 200:
                return ""
            payload = res.json()
            items = payload.get("results") or payload.get("items") or []
            if not items:
                return ""
            lines = []
            for i in items:
                if isinstance(i, dict):
                    lines.append(f"- {i.get('text', '')}")
                else:
                    lines.append(f"- {i}")
            return "Retrieved:\n" + "\n".join(lines)
    except Exception as exc:
        logger.warning("[context] RAG search failed: %s", exc)
        return ""


async def build_context(
    query: str,
    user_id: str,
    chat_history: List[Dict[str, str]],
    rag_enabled: bool,
    manifest_text: Optional[str] = None,
    *,
    include_manifest: bool = True,
    rag_block: Optional[str] = None,
) -> str:
    parts = []

    if include_manifest:
        if manifest_text is None:
            manifest_text, _, _ = await fetch_integration_manifest(user_id)
        if manifest_text:
            parts.append(manifest_text)

    if rag_enabled:
        block = rag_block
        if block is None:
            block = await fetch_rag_context(query, user_id)
        if block:
            parts.append(block)

    recent = chat_history[-MAX_HISTORY:] if chat_history else []
    if recent:
        parts.append(
            "Recent conversation:\n"
            + "\n".join(f"{m.get('role')}: {m.get('content', '')[:200]}" for m in recent)
        )

    return "\n\n".join(parts)
