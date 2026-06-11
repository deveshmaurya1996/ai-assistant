
import asyncio
import logging
import os
import re
import time
from typing import Dict, List, Optional, Set, Tuple

import httpx

logger = logging.getLogger(__name__)

from ai_http import ai_http_client, ai_request_url
from cognitive_env_loader import (
    resolve_capability_runtime_url,
    resolve_public_api_url,
)

GATEWAY_URL = resolve_public_api_url()
CAPABILITY_RUNTIME_URL = resolve_capability_runtime_url()
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")
MAX_HISTORY = 20
RAG_TIMEOUT = float(os.getenv("RAG_TIMEOUT_SECONDS", "5"))
MEMORY_FACT_LIMIT = int(os.getenv("MEMORY_FACT_LIMIT", "5"))
MANIFEST_CACHE_TTL_SECONDS = float(os.getenv("MANIFEST_CACHE_TTL_SECONDS", "60"))
_manifest_cache: Dict[str, Tuple[float, str, Set[str], List[Dict], List[Dict]]] = {}


def is_rag_globally_enabled() -> bool:
    raw = os.getenv("RAG_ENABLED", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


def merge_context_blocks(*parts: str) -> str:
    return "\n\n".join(p.strip() for p in parts if p and p.strip())


def is_rag_retrieval_always() -> bool:
    """RAG_RETRIEVAL_MODE=always forces search every turn (debug); default is smart."""
    return os.getenv("RAG_RETRIEVAL_MODE", "smart").strip().lower() == "always"


_GREETING_ONLY = re.compile(
    r"^(?:hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|cool|great|bye|goodbye"
    r"|good morning|good night|how are you|how r u|how's it going|what's up|sup)"
    r"[\s!.?]*$",
    re.IGNORECASE,
)

_MEMORY_SIGNALS = (
    "remember",
    "recall",
    "what did i",
    "what did we",
    "what have we",
    "from my notes",
    "from my memory",
    "search my",
    "in my documents",
    "knowledge base",
    "previously",
    "last time we",
    "we discussed",
    "we talked",
    "you told me",
    "you said earlier",
    "earlier you",
    "do you know my",
    "do you remember",
    "our conversation",
    "chat history",
    "saved note",
    "my notes",
    "about me",
    "my preference",
    "my project",
)


async def _should_retrieve_via_llm(query: str) -> Optional[bool]:
    if os.getenv("RAG_ROUTER_MODE", "heuristic").strip().lower() != "llm":
        return None
    q = (query or "").strip()
    if not q:
        return False
    try:
        async with ai_http_client(timeout=8.0) as client:
            res = await client.post(
                ai_request_url("/v1/memory/should-retrieve"),
                json={"query": q},
            )
            if res.status_code != 200:
                return None
            data = res.json()
            return bool(data.get("retrieve"))
    except Exception as exc:
        logger.warning("[context] LLM retrieve router failed: %s", exc)
        return None


_ASSISTANT_META_QUERY = re.compile(
    r"\b(?:who are you|what(?:'s|s| is)\s+(?:your|yout|ur)\s+name|what do you call yourself|"
    r"introduce yourself|tell me about yourself|your name)\b",
    re.IGNORECASE,
)


def is_memory_recall_query(query: str) -> bool:
    """User wants prior chats / saved facts — needs RAG, not the no-RAG smalltalk path."""
    if is_smalltalk_query(query) or is_assistant_meta_query(query):
        return False
    lower = (query or "").strip().lower()
    return any(signal in lower for signal in _MEMORY_SIGNALS)


def is_smalltalk_query(query: str) -> bool:
    """Greetings and chit-chat — skip memory retrieval and other pre-stream work."""
    q = (query or "").strip()
    if not q:
        return True
    if _GREETING_ONLY.match(q):
        return True
    lower = q.lower()
    if len(q) < 48 and "?" not in q:
        if not any(signal in lower for signal in _MEMORY_SIGNALS):
            from orchestration.signals import is_likely_tool_query

            if not is_likely_tool_query(q):
                return True
    return False


def is_assistant_meta_query(query: str) -> bool:
    """Questions about the assistant's identity — skip memory that contradicts settings."""
    return bool(_ASSISTANT_META_QUERY.search((query or "").strip()))


def build_assistant_identity_block(
    assistant_display_name: Optional[str],
    personality_id: Optional[str],
) -> str:
    name = (assistant_display_name or "").strip() or "Assistant"
    pid = (personality_id or "").strip() or "assistant"
    return (
        f"Assistant identity (authoritative): Your name is {name}. "
        f"Active personality preset: {pid}. "
        "When asked who you are or your name, answer using this identity only. "
        "Never say you have no name, no personal identity, or that you are only a generic AI. "
        "Never use a different name from past chats or retrieved context."
    )


def should_retrieve_rag_context(
    query: str,
    *,
    has_file_context: bool = False,
) -> bool:
    if is_rag_retrieval_always():
        return bool((query or "").strip())

    q = (query or "").strip()
    if not q:
        return False

    if _GREETING_ONLY.match(q):
        return False

    lower = q.lower()

    if any(signal in lower for signal in _MEMORY_SIGNALS):
        return True

    if re.search(
        r"\b(?:what(?:'s| is) my|when did i|where did i|who am i)\b",
        lower,
    ):
        return True

    if re.search(
        r"\b(?:before|earlier|last time|yesterday|ago)\b.{0,40}\b(?:said|told|mentioned|discussed)\b",
        lower,
    ):
        return True

    # Attachment turns: file excerpt is primary; skip RAG unless memory is explicit.
    if has_file_context and not any(signal in lower for signal in _MEMORY_SIGNALS):
        from orchestration.signals import is_likely_tool_query

        if is_likely_tool_query(q):
            return False
        if re.search(
            r"\b(?:summarize|summary|explain|describe|analyze|what is in|read)\b",
            lower,
        ):
            return False

    from orchestration.signals import is_likely_tool_query

    if is_likely_tool_query(q):
        return False

    if len(q) < 24 and "?" not in q:
        return False

    return False


async def should_retrieve_rag_context_async(
    query: str,
    *,
    has_file_context: bool = False,
) -> bool:
    if is_smalltalk_query(query) or is_assistant_meta_query(query):
        return False
    if is_memory_recall_query(query):
        return True
    if should_retrieve_rag_context(query, has_file_context=has_file_context):
        return True
    llm = await _should_retrieve_via_llm(query)
    if llm is not None:
        return llm
    return False


async def fetch_curated_facts_block(user_id: str, limit: Optional[int] = None) -> str:
    lim = limit if limit is not None else MEMORY_FACT_LIMIT
    headers = {"X-Internal-Token": INTERNAL_SERVICE_TOKEN}
    try:
        async with httpx.AsyncClient(timeout=min(RAG_TIMEOUT, 4.0)) as client:
            res = await client.get(
                f"{GATEWAY_URL}/internal/memory/facts",
                params={"userId": user_id, "limit": lim},
                headers=headers,
            )
            if res.status_code != 200:
                return ""
            payload = res.json()
            facts = payload.get("facts") or []
            if not facts:
                return ""
            lines = [
                f"- {str(f.get('content', '')).strip()}"
                for f in facts
                if isinstance(f, dict) and str(f.get("content", "")).strip()
            ]
            if not lines:
                return ""
            return "Known facts:\n" + "\n".join(lines)
    except Exception as exc:
        logger.warning("[context] curated facts fetch failed: %s", exc)
        return ""


def _dedupe_memory_blocks(*blocks: str) -> str:
    seen: set[str] = set()
    unique_parts: List[str] = []
    for block in blocks:
        if not block or not block.strip():
            continue
        key = block.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        unique_parts.append(block.strip())
    return merge_context_blocks(*unique_parts)


def _attachment_file_context_max_chars() -> int:
    raw = os.getenv("ATTACHMENT_FILE_CONTEXT_MAX_CHARS", "8000")
    try:
        n = int(raw)
        return min(max(n, 500), 50_000)
    except ValueError:
        return 8000


def _truncate_context_block(text: Optional[str], max_chars: int) -> str:
    if not text or not text.strip():
        return ""
    s = text.strip()
    if len(s) <= max_chars:
        return s
    return s[:max_chars] + "\n…(truncated)"


def assemble_turn_context(
    *,
    session_context: Optional[str] = None,
    file_context: Optional[str] = None,
    identity_block: Optional[str] = None,
    memory_block: Optional[str] = None,
    cap_file_context: bool = False,
) -> Optional[str]:
    """Prompt order: this chat → files → identity → global memory."""
    file_block = file_context or ""
    if cap_file_context and file_block:
        file_block = _truncate_context_block(file_block, _attachment_file_context_max_chars())
    session_block = session_context or ""
    if cap_file_context and session_block:
        session_block = _truncate_context_block(session_block, _attachment_file_context_max_chars())
    return merge_context_blocks(
        (
            f"Current chat context:\n{session_block.strip()}"
            if session_block and session_block.strip()
            else ""
        ),
        file_block,
        identity_block or "",
        memory_block or "",
    ) or None


async def fetch_layered_memory_context(
    query: str,
    user_id: str,
    *,
    limit: int = 3,
    skip_episodic: bool = False,
    chat_session_id: Optional[str] = None,
) -> str:
    """Layer 3 curated facts (Postgres) + Layer 2 episodic vector search (Qdrant), in parallel."""
    if is_assistant_meta_query(query):
        return ""

    facts_coro = fetch_curated_facts_block(user_id)
    if skip_episodic:
        facts_block = await facts_coro
        return facts_block

    facts_result, episodic_result = await asyncio.gather(
        facts_coro,
        fetch_rag_context(
            query, user_id, limit=limit, chat_session_id=chat_session_id
        ),
        return_exceptions=True,
    )
    facts_block = facts_result if isinstance(facts_result, str) else ""
    episodic_block = episodic_result if isinstance(episodic_result, str) else ""
    if isinstance(facts_result, Exception):
        logger.warning("[context] curated facts fetch failed: %s", facts_result)
    if isinstance(episodic_result, Exception):
        logger.warning("[context] episodic search failed: %s", episodic_result)
    return _dedupe_memory_blocks(facts_block, episodic_block)


def _parse_manifest_response(data: Dict) -> Tuple[str, Set[str], List[Dict], List[Dict]]:
    text = str(data.get("plannerText", "")).strip()
    caps = {
        c["id"]
        for c in (data.get("manifest") or {}).get("capabilities", [])
        if isinstance(c, dict) and c.get("id")
    }
    connections = data.get("connections") or []
    if not isinstance(connections, list):
        connections = []
    connection_states = data.get("connectionStates") or []
    if not isinstance(connection_states, list):
        connection_states = []
    return text, caps, connections, connection_states


async def _fetch_manifest_endpoint(
    base: str,
    path: str,
    user_id: str,
    headers: Dict[str, str],
) -> Optional[Tuple[str, Set[str], List[Dict], List[Dict]]]:
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(
                f"{base}{path}",
                params={"userId": user_id},
                headers=headers,
            )
            if res.status_code != 200:
                return None
            return _parse_manifest_response(res.json())
    except Exception:
        return None


def invalidate_integration_manifest(user_id: str) -> None:
    _manifest_cache.pop(user_id, None)


async def fetch_integration_manifest(
    user_id: str,
) -> Tuple[str, Set[str], List[Dict], List[Dict]]:
    now = time.monotonic()
    cached = _manifest_cache.get(user_id)
    if cached and cached[0] > now:
        return cached[1], cached[2], cached[3], cached[4]

    headers = {"X-Internal-Token": INTERNAL_SERVICE_TOKEN}
    gateway_result = await _fetch_manifest_endpoint(
        GATEWAY_URL, "/internal/integrations/manifest", user_id, headers
    )

    if gateway_result is not None:
        text, caps, connections, connection_states = gateway_result
        _manifest_cache[user_id] = (
            now + MANIFEST_CACHE_TTL_SECONDS,
            text,
            caps,
            connections,
            connection_states,
        )
        return text, caps, connections, connection_states

    capability_result = await _fetch_manifest_endpoint(
        CAPABILITY_RUNTIME_URL, "/v1/integrations/manifest", user_id, {}
    )
    if capability_result is not None:
        text, caps, connections, connection_states = capability_result
        _manifest_cache[user_id] = (
            now + MANIFEST_CACHE_TTL_SECONDS,
            text,
            caps,
            connections,
            connection_states,
        )
        return text, caps, connections, connection_states

    empty: Tuple[str, Set[str], List[Dict], List[Dict]] = ("", set(), [], [])
    _manifest_cache[user_id] = (now + MANIFEST_CACHE_TTL_SECONDS, "", set(), [], [])
    return empty


async def fetch_rag_context(
    query: str,
    user_id: str,
    *,
    limit: int = 3,
    chat_session_id: Optional[str] = None,
) -> str:
    try:
        params: Dict[str, str | int] = {
            "query": query,
            "limit": limit,
            "user_id": user_id,
        }
        if chat_session_id:
            params["session_id"] = chat_session_id
        async with ai_http_client(timeout=RAG_TIMEOUT) as client:
            res = await client.get(
                ai_request_url("/v1/memory/search"),
                params=params,
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
    from orchestration.platform_capabilities import platform_capabilities_block

    parts = [platform_capabilities_block()]

    if include_manifest:
        if manifest_text is None:
            manifest_text, _, _, _ = await fetch_integration_manifest(user_id)
        if manifest_text:
            parts.append(manifest_text)

    if rag_enabled:
        block = rag_block
        if block is None and should_retrieve_rag_context(query):
            block = await fetch_curated_facts_block(user_id)
        if block:
            parts.append(block)

    recent = chat_history[-MAX_HISTORY:] if chat_history else []
    if recent:
        parts.append(
            "Recent conversation:\n"
            + "\n".join(f"{m.get('role')}: {m.get('content', '')[:200]}" for m in recent)
        )

    return "\n\n".join(parts)
