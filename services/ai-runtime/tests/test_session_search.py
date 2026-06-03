from unittest.mock import MagicMock, patch

import sys

if "qdrant_client" not in sys.modules:
    _qc = MagicMock()
    sys.modules["qdrant_client"] = _qc
    sys.modules["qdrant_client.http"] = _qc

from memory.rag_service import RAGService


def test_search_prefers_session_then_fallback():
    rag = object.__new__(RAGService)
    rag.collection_name = "test"
    rag.min_score = 0.0
    rag.rerank_fetch_limit = 5
    rag.rerank_enabled = False
    rag.client = MagicMock()

    session_hit = MagicMock()
    session_hit.score = 0.9
    session_hit.payload = {
        "text": "session hit",
        "user_id": "u1",
        "chat_session_id": "sess-a",
    }

    other_hit = MagicMock()
    other_hit.score = 0.8
    other_hit.payload = {
        "text": "other chat",
        "user_id": "u1",
        "chat_session_id": "sess-b",
    }

    rag.client.query_points.side_effect = [
        MagicMock(points=[session_hit]),
        MagicMock(points=[other_hit]),
    ]

    with patch.object(rag, "_embed", return_value=[[0.1]]):
        results = rag._search_context(
            "query", limit=2, user_id="u1", chat_session_id="sess-a"
        )

    assert len(results) >= 1
    assert results[0]["text"] == "session hit"
