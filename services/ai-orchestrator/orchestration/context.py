"""Context window management — compression, retrieval, token budget."""
import os
from typing import Dict, List

import httpx

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")
TOOL_RUNTIME_URL = os.getenv("TOOL_RUNTIME_URL", "http://localhost:3011")
MAX_HISTORY = 20


async def _connection_manifest(user_id: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                f"{TOOL_RUNTIME_URL}/v1/tools/available",
                params={"userId": user_id},
            )
            if res.status_code != 200:
                return ""
            data = res.json()
            connections = data.get("connections", [])
            if not connections:
                return "Connected apps: none (user must connect apps in Connect Apps)."
            names = ", ".join(c["providerId"] for c in connections)
            return f"Connected apps available to AI: {names}."
    except Exception:
        return ""


async def build_context(
    query: str,
    user_id: str,
    chat_history: List[Dict[str, str]],
    rag_enabled: bool,
) -> str:
    parts = []

    manifest = await _connection_manifest(user_id)
    if manifest:
        parts.append(manifest)

    if rag_enabled:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    f"{AI_SERVICE_URL}/v1/kb/search",
                    json={"query": query, "limit": 3, "user_id": user_id},
                )
                if res.status_code == 200:
                    items = res.json().get("items", [])
                    if items:
                        parts.append(
                            "Retrieved:\n"
                            + "\n".join(f"- {i.get('text', '')}" for i in items)
                        )
        except Exception:
            pass

    recent = chat_history[-MAX_HISTORY:] if chat_history else []
    if recent:
        parts.append(
            "Recent conversation:\n"
            + "\n".join(f"{m.get('role')}: {m.get('content', '')[:200]}" for m in recent)
        )

    return "\n\n".join(parts)
