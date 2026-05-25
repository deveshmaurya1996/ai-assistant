import os
import uuid
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer

COLLECTION_NAME = "kb_documents"
EMBEDDING_DIM = 384


class RAGService:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(RAGService, cls).__new__(cls, *args, **kwargs)
            cls._instance._init_service()
        return cls._instance

    def _init_service(self):
        qdrant_url = os.getenv("QDRANT_URL")
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        db_path = os.path.join(base_dir, "qdrant_db")
        os.makedirs(db_path, exist_ok=True)

        if qdrant_url:
            self.client = QdrantClient(url=qdrant_url)
        else:
            self.client = QdrantClient(path=db_path)

        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        self._ensure_collection()

    def _ensure_collection(self):
        try:
            self.client.get_collection(collection_name=COLLECTION_NAME)
        except Exception:
            self.client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIM,
                    distance=models.Distance.COSINE,
                ),
            )

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
        points = []
        point_ids = []

        for doc in documents:
            text = doc.get("text", "")
            if not text.strip():
                continue

            metadata = dict(doc.get("metadata", {}))
            if user_id:
                metadata["user_id"] = user_id

            payload = {"text": text, **metadata}
            embedding = self.model.encode(text).tolist()
            point_id = str(uuid.uuid4())
            points.append(
                models.PointStruct(id=point_id, vector=embedding, payload=payload)
            )
            point_ids.append(point_id)

        if points:
            self.client.upsert(collection_name=COLLECTION_NAME, points=points)

        return point_ids

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

        query_vector = self.model.encode(query).tolist()
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

        results = self.client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            limit=limit,
            query_filter=query_filter,
        )

        context_items = []
        for hit in results.points:
            payload = dict(hit.payload or {})
            text = payload.pop("text", "")
            context_items.append(
                {"text": text, "score": hit.score, "metadata": payload}
            )

        return context_items
