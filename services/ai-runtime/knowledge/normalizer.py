
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class KnowledgeItem:
    type: str
    source: str
    title: str
    timestamp: Optional[str] = None
    content: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _unwrap(entry: Dict[str, Any]) -> Any:
    result = entry.get("result")
    if isinstance(result, dict) and "data" in result:
        return result["data"]
    return result


def normalize_tool_results(tool_results: List[Dict[str, Any]]) -> List[KnowledgeItem]:
    items: List[KnowledgeItem] = []
    for entry in tool_results:
        if entry.get("requiresConfirmation") or entry.get("error"):
            continue
        tool = str(entry.get("tool") or "")
        payload = _unwrap(entry)
        items.extend(_normalize_tool_payload(tool, payload))
    return items


def _normalize_tool_payload(tool: str, payload: Any) -> List[KnowledgeItem]:
    if not isinstance(payload, dict):
        return []

    if tool.startswith(("whatsapp.", "messaging.")):
        if payload.get("type") == "messaging.search_result":
            return [
                KnowledgeItem(
                    type="message",
                    source="whatsapp",
                    title=str(row.get("sender") or row.get("chatId") or "Chat"),
                    timestamp=row.get("timestamp"),
                    content=str(row.get("body") or ""),
                    metadata={
                        "chatId": row.get("chatId"),
                        "messageId": row.get("messageId"),
                        "sender": row.get("sender"),
                    },
                )
                for row in payload.get("items") or []
                if isinstance(row, dict)
            ]
        if payload.get("type") == "messaging.unread_list":
            return [
                KnowledgeItem(
                    type="message",
                    source="whatsapp",
                    title=str(row.get("sender") or "Chat"),
                    timestamp=row.get("timestamp"),
                    content=str(row.get("preview") or ""),
                    metadata={"chatId": row.get("chatId"), "unreadCount": row.get("unreadCount")},
                )
                for row in payload.get("items") or []
                if isinstance(row, dict)
            ]
        messages = payload.get("messages")
        if isinstance(messages, list):
            return [
                KnowledgeItem(
                    type="message",
                    source="whatsapp",
                    title=str(payload.get("displayName") or payload.get("chatId") or "Chat"),
                    timestamp=row.get("timestamp"),
                    content=str(row.get("body") or ""),
                    metadata={"chatId": payload.get("chatId"), "messageId": row.get("id")},
                )
                for row in messages
                if isinstance(row, dict)
            ]

    if tool.startswith(("email.", "gmail.")):
        emails = payload.get("emails") or payload.get("items") or []
        if isinstance(emails, list):
            return [
                KnowledgeItem(
                    type="email",
                    source="gmail",
                    title=str(row.get("subject") or "Email"),
                    timestamp=row.get("date") or row.get("timestamp"),
                    content=str(row.get("preview") or row.get("snippet") or row.get("body") or ""),
                    metadata={"from": row.get("from"), "id": row.get("id")},
                )
                for row in emails
                if isinstance(row, dict)
            ]

    if tool.startswith("calendar."):
        events = payload.get("events") or payload.get("items") or []
        if isinstance(events, list):
            return [
                KnowledgeItem(
                    type="event",
                    source="calendar",
                    title=str(row.get("title") or row.get("summary") or "Event"),
                    timestamp=row.get("start") or row.get("startTime"),
                    content=str(row.get("description") or ""),
                    metadata={"eventId": row.get("id"), "location": row.get("location")},
                )
                for row in events
                if isinstance(row, dict)
            ]

    if tool.startswith("drive."):
        files = payload.get("files") or payload.get("items") or []
        if isinstance(files, list):
            return [
                KnowledgeItem(
                    type="file",
                    source="drive",
                    title=str(row.get("name") or row.get("title") or "File"),
                    timestamp=row.get("modifiedTime"),
                    content=str(row.get("snippet") or row.get("content") or ""),
                    metadata={"fileId": row.get("id"), "mimeType": row.get("mimeType")},
                )
                for row in files
                if isinstance(row, dict)
            ]

    return []


def format_knowledge_items(items: List[KnowledgeItem], *, limit: int = 20) -> str:
    if not items:
        return ""
    lines: List[str] = []
    for item in items[:limit]:
        ts = f" ({item.timestamp})" if item.timestamp else ""
        lines.append(f"[{item.source}/{item.type}] {item.title}{ts}: {item.content[:500]}")
    return "\n".join(lines)
