from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class TenantScope:
    tenant_id: str
    user_id: str


@dataclass(frozen=True)
class RequestContext:
    scope: TenantScope
    conversation_id: str
    source: str
    timezone: str
    connected_accounts: Dict[str, str] = field(default_factory=dict)
    rag_enabled: bool = True
    confirmed: bool = False
    personality_id: Optional[str] = None
    assistant_display_name: Optional[str] = None
    system_prompt: Optional[str] = None
    file_retrieval_context: Optional[str] = None
    session_context: Optional[str] = None
    chat_session_id: Optional[str] = None
    preferred_model_id: Optional[str] = None
    session_model_id: Optional[str] = None
    chat_history: List[Dict[str, str]] = field(default_factory=list)
    attachments: List[Dict[str, Any]] = field(default_factory=list)
    resolved_attachments: List[Dict[str, Any]] = field(default_factory=list)
    tool_results: Optional[List[Dict[str, Any]]] = None
    skip_planning: bool = False
    routing_query: Optional[str] = None

    @classmethod
    def from_turn_request(cls, payload: Any) -> RequestContext:
        user_id = str(getattr(payload, "user_id", "") or "").strip()
        tenant_id = user_id
        return cls(
            scope=TenantScope(tenant_id=tenant_id, user_id=user_id),
            conversation_id=str(getattr(payload, "chat_session_id", "") or user_id),
            source=str(getattr(payload, "source", "chat") or "chat"),
            timezone=str(getattr(payload, "timezone", "") or "UTC"),
            rag_enabled=bool(getattr(payload, "rag_enabled", True)),
            confirmed=bool(getattr(payload, "confirmed", False)),
            personality_id=getattr(payload, "personality_id", None),
            assistant_display_name=getattr(payload, "assistant_display_name", None),
            system_prompt=getattr(payload, "system_prompt", None),
            file_retrieval_context=getattr(payload, "file_retrieval_context", None),
            session_context=getattr(payload, "session_context", None),
            chat_session_id=getattr(payload, "chat_session_id", None),
            preferred_model_id=getattr(payload, "preferred_model_id", None),
            session_model_id=getattr(payload, "session_model_id", None),
            chat_history=list(getattr(payload, "chat_history", []) or []),
            attachments=list(getattr(payload, "attachments", []) or []),
            resolved_attachments=list(getattr(payload, "resolved_attachments", []) or []),
            tool_results=getattr(payload, "tool_results", None),
            skip_planning=bool(getattr(payload, "skip_planning", False)),
            routing_query=getattr(payload, "routing_query", None),
        )
