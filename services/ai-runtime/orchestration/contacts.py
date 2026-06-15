from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


def looks_like_jid(value: str) -> bool:
    return "@" in value


def looks_like_phone(value: str) -> bool:
    digits = re.sub(r"\D", "", value)
    return len(digits) >= 10


def resolve_whatsapp_jid_from_search(
    target_val: str,
    prior_results: List[Dict[str, Any]],
    resolved_jid: Optional[str] = None,
) -> Optional[str]:
    if resolved_jid and not looks_like_jid(target_val):
        return resolved_jid
    if looks_like_jid(target_val) or looks_like_phone(target_val):
        return target_val if looks_like_jid(target_val) else None
    for prev in prior_results:
        if prev.get("tool") != "whatsapp.search_chats":
            continue
        if prev.get("error"):
            continue
        chats = (prev.get("result") or {}).get("chats", [])
        if chats and chats[0].get("jid"):
            return chats[0]["jid"]
    return None


def enrich_whatsapp_send_to(
    pending_confirm: List[Dict[str, Any]],
    completed: List[Dict[str, Any]],
) -> None:
    """Fill send_message 'to' JID from completed search_chats (main.py confirm path)."""
    for pending in pending_confirm:
        if pending.get("tool") != "whatsapp.send_message":
            continue
        args = pending.setdefault("args", {})
        if looks_like_jid(str(args.get("to", ""))):
            continue
        for done in completed:
            if done.get("tool") != "whatsapp.search_chats":
                continue
            result = done.get("result") or {}
            chats = result.get("chats", []) if isinstance(result, dict) else []
            if chats:
                args["to"] = chats[0].get("jid", args.get("to"))
                break
