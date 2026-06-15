import re
from typing import Any, Dict, List

BLOCKED_PATTERNS = [
    r"ignore\s+previous\s+instructions",
    r"system\s+prompt",
    r"<script",
]

DANGEROUS_CHAINS = [
    ("gmail.send", "whatsapp.send_message"),
]


def sanitize_tool_args(args: Dict[str, Any]) -> Dict[str, Any]:
    sanitized = {}
    for key, val in args.items():
        if isinstance(val, str):
            for pattern in BLOCKED_PATTERNS:
                val = re.sub(pattern, "", val, flags=re.IGNORECASE)
            sanitized[key] = val[:10000]
        else:
            sanitized[key] = val
    return sanitized


def validate_tool_chain(tools: List[str]) -> bool:
    for i, t1 in enumerate(tools):
        for t2 in tools[i + 1 :]:
            if (t1, t2) in DANGEROUS_CHAINS:
                return False
    return True


__all__ = ["sanitize_tool_args", "validate_tool_chain"]
