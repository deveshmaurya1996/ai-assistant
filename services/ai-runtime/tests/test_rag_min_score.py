import sys
from unittest.mock import MagicMock, patch

# Avoid requiring qdrant_client at import time in CI/dev without venv.
if "qdrant_client" not in sys.modules:
    _qc = MagicMock()
    sys.modules["qdrant_client"] = _qc
    sys.modules["qdrant_client.http"] = _qc

from rag.rag_service import RAGService


def test_search_filters_below_min_score():
    rag = object.__new__(RAGService)
    rag.collection_name = "test"
    rag.min_score = 0.5
    rag.rerank_fetch_limit = 5
    rag.rerank_enabled = False

    low = MagicMock()
    low.score = 0.2
    low.payload = {"text": "weak hit"}

    high = MagicMock()
    high.score = 0.8
    high.payload = {"text": "strong hit"}

    rag.client = MagicMock()
    rag.client.query_points.return_value = MagicMock(points=[low, high])

    with patch.object(rag, "_embed", return_value=[[0.1]]):
        results = rag._search_context("query", limit=3, user_id="u1")

    assert len(results) == 1
    assert results[0]["text"] == "strong hit"
