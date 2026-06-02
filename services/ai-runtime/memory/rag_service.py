import asyncio
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models

from models.config_loader import get_rag_config

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="rag")


def _nvidia_embed_available() -> bool:
    return bool(os.getenv("NVIDIA_API_KEY", "").strip())


class RAGService:
    _instance = None
    _warm_lock = asyncio.Lock()
    _warmed = False

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(RAGService, cls).__new__(cls, *args, **kwargs)
            cls._instance._init_service()
        return cls._instance

    def _init_service(self):
        cfg = get_rag_config()
        self.collection_name = str(cfg.get("collectionName", "kb_documents_nv"))
        self.embedding_dim = int(cfg.get("embeddingDim", 4096))
        self.rerank_fetch_limit = int(cfg.get("rerankFetchLimit", 12))

        qdrant_url = os.getenv("QDRANT_URL")
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        db_path = os.path.join(base_dir, "qdrant_db")
        os.makedirs(db_path, exist_ok=True)

        if qdrant_url:
            self.client = QdrantClient(url=qdrant_url)
        else:
            self.client = QdrantClient(path=db_path)

        self._ensure_collection()

    def _ensure_collection(self):
        try:
            self.client.get_collection(collection_name=self.collection_name)
        except Exception:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.embedding_dim,
                    distance=models.Distance.COSINE,
                ),
            )

    def _embed(self, texts: List[str], *, input_type: str) -> List[List[float]]:
        if not _nvidia_embed_available():
            raise RuntimeError("NVIDIA_API_KEY is required for RAG embeddings")
        from models.providers.nvidia_embeddings import embed_texts

        return embed_texts(texts, input_type=input_type)

    @classmethod
    async def warm_embedder(cls) -> None:
        cfg = get_rag_config()
        if not cfg.get("warmEmbedderOnStartup", True):
            return
        if not _nvidia_embed_available():
            logger.info("[rag] embedder warmup skipped — NVIDIA_API_KEY not set")
            return
        async with cls._warm_lock:
            if cls._warmed:
                return
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(_executor, cls._warm_sync)
            cls._warmed = True
            logger.info("[rag] NVIDIA embedder warmed")

    @classmethod
    def _warm_sync(cls) -> None:
        rag = RAGService()
        rag._embed(["warmup"], input_type="query")

    def ingest_documents(
        self, documents: List[Dict[str, Any]], user_id: Optional[str] = None
    ) -> List[str]:
        from opentelemetry import trace

        tracer = trace.get_tracer(__name__)
        with tracer.start_as_current_span(
            "rag.ingest",
            attributes={"doc_count": len(documents), "user_id": user_id or ""},
        ):
            return self._ingest_documents(documents, user_id)

    def _ingest_documents(
        self, documents: List[Dict[str, Any]], user_id: Optional[str] = None
    ) -> List[str]:
        texts: List[str] = []
        payloads: List[Dict[str, Any]] = []
        point_ids: List[str] = []

        for doc in documents:
            text = doc.get("text", "")
            if not text.strip():
                continue

            metadata = dict(doc.get("metadata", {}))
            if user_id:
                metadata["user_id"] = user_id

            texts.append(text)
            payloads.append({"text": text, **metadata})
            point_ids.append(str(uuid.uuid4()))

        if not texts:
            return []

        embeddings = self._embed(texts, input_type="passage")
        points = [
            models.PointStruct(id=pid, vector=emb, payload=payload)
            for pid, emb, payload in zip(point_ids, embeddings, payloads)
        ]
        self.client.upsert(collection_name=self.collection_name, points=points)
        return point_ids

    async def search_context_async(
        self, query: str, limit: Optional[int] = None, user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        cfg = get_rag_config()
        lim = limit if limit is not None else int(cfg.get("limit", 3))
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            _executor, lambda: self.search_context(query, lim, user_id)
        )

    def search_context(
        self, query: str, limit: int = 3, user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        from opentelemetry import trace

        tracer = trace.get_tracer(__name__)
        with tracer.start_as_current_span(
            "rag.search",
            attributes={"limit": limit, "user_id": user_id or ""},
        ):
            return self._search_context(query, limit, user_id)

    def _search_context(
        self, query: str, limit: int = 3, user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        if not query.strip():
            return []

        query_vector = self._embed([query], input_type="query")[0]
        query_filter = None
        if user_id:
            query_filter = models.Filter(
                must=[
                    models.FieldCondition(
                        key="user_id",
                        match=models.MatchValue(value=user_id),
                    )
                ]
            )

        fetch_limit = max(limit, self.rerank_fetch_limit)
        results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            limit=fetch_limit,
            query_filter=query_filter,
        )

        hits = list(results.points)
        if not hits:
            return []

        passages = []
        hit_payloads: List[Dict[str, Any]] = []
        for hit in hits:
            payload = dict(hit.payload or {})
            text = str(payload.pop("text", ""))
            passages.append(text)
            hit_payloads.append(
                {"text": text, "score": hit.score, "metadata": payload}
            )

        if _nvidia_embed_available() and len(passages) > 1:
            try:
                from models.providers.nvidia_rerank import rerank_passages

                order = rerank_passages(query, passages)
                hit_payloads = [hit_payloads[i] for i in order if i < len(hit_payloads)]
            except Exception as exc:
                logger.warning("[rag] rerank failed, using vector order: %s", exc)

        return hit_payloads[:limit]
