from __future__ import annotations

import os
from typing import Any, Dict

from env_loader import resolve_internal_gateway_url

GATEWAY_URL = resolve_internal_gateway_url()
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")


def internal_headers() -> Dict[str, str]:
    return {"X-Internal-Token": INTERNAL_SERVICE_TOKEN}


def omit_none(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def gateway_error_message(err: Any, fallback: str) -> str:
    if not isinstance(err, dict):
        return fallback
    msg = str(err.get("error") or fallback)
    details = err.get("details")
    if isinstance(details, list) and details:
        first = details[0]
        if isinstance(first, dict) and first.get("message"):
            return f"{msg}: {first['message']}"
    return msg
