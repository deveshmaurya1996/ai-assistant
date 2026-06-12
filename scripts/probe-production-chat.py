from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROD_URL = os.getenv("PROD_API_URL", "https://ai-assistant-v1-2jli.onrender.com").rstrip(
    "/"
)
TTFB_BUDGET_MS = float(os.getenv("PROBE_TTFB_BUDGET_MS", "10000"))


def load_internal_token() -> str:
    env_file = ROOT / ".env.production"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("INTERNAL_SERVICE_TOKEN="):
                return line.split("=", 1)[1].strip()
    token = os.getenv("INTERNAL_SERVICE_TOKEN", "").strip()
    if not token:
        raise SystemExit("INTERNAL_SERVICE_TOKEN not found in .env.production or env")
    return token


def fetch_json(path: str, token: str | None = None, timeout: float = 30.0) -> tuple[int, object, float]:
    headers = {"Accept": "application/json"}
    if token:
        headers["X-Internal-Token"] = token
    req = urllib.request.Request(f"{PROD_URL}{path}", headers=headers, method="GET")
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            ms = (time.perf_counter() - t0) * 1000
            return resp.status, json.loads(body) if body else {}, ms
    except urllib.error.HTTPError as exc:
        ms = (time.perf_counter() - t0) * 1000
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"raw": body[:300]}
        return exc.code, parsed, ms


def stream_chat(query: str, *, token: str, timeout_s: float = 120.0) -> dict:
    body = json.dumps(
        {
            "query": query,
            "rag_enabled": False,
            "chat_history": [],
            "task": "fast_chat",
            "task_locked": True,
            "allow_thinking": False,
        }
    ).encode()
    req = urllib.request.Request(
        f"{PROD_URL}/internal/v1/intelligence/chat/stream",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "X-Internal-Token": token,
        },
    )
    t0 = time.perf_counter()
    events: list[tuple[str, dict]] = []
    first_byte_ms: float | None = None
    first_token_ms: float | None = None
    preview = ""
    error: str | None = None

    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            buf = ""
            while True:
                chunk = resp.read(1)
                if not chunk:
                    break
                if first_byte_ms is None:
                    first_byte_ms = (time.perf_counter() - t0) * 1000
                buf += chunk.decode("utf-8", errors="replace")
                while "\n\n" in buf:
                    block, buf = buf.split("\n\n", 1)
                    ev_type = "message"
                    data = ""
                    for line in block.splitlines():
                        if line.startswith("event:"):
                            ev_type = line[6:].strip()
                        elif line.startswith("data:"):
                            data = line[5:].strip()
                    if not data:
                        continue
                    parsed = json.loads(data)
                    events.append((ev_type, parsed))
                    if ev_type == "token" and first_token_ms is None:
                        first_token_ms = (time.perf_counter() - t0) * 1000
                        preview += str(parsed.get("content", ""))
                    if ev_type == "error":
                        error = str(parsed.get("message") or parsed)
    except Exception as exc:
        error = str(exc)

    total_ms = (time.perf_counter() - t0) * 1000
    return {
        "query": query,
        "first_byte_ms": round(first_byte_ms or total_ms, 0),
        "first_token_ms": round(first_token_ms, 0) if first_token_ms else None,
        "total_ms": round(total_ms, 0),
        "preview": preview[:120],
        "events": len(events),
        "error": error,
    }


def main() -> int:
    token = load_internal_token()
    print(f"Production: {PROD_URL}")
    print(f"TTFB budget: {TTFB_BUDGET_MS:.0f}ms\n")

    status, health, ms = fetch_json("/health")
    print(f"GET /health -> {status} ({ms:.0f}ms)")
    if status != 200:
        print("Health check failed")
        return 1

    result = stream_chat("hi", token=token)
    print(json.dumps(result, indent=2))

    if result.get("error"):
        print("\nFAIL: stream error")
        return 1
    if result.get("first_token_ms") is None:
        print("\nFAIL: no token received")
        return 1
    if result["first_token_ms"] > TTFB_BUDGET_MS:
        print(f"\nFAIL: first_token_ms {result['first_token_ms']} > budget {TTFB_BUDGET_MS}")
        return 1

    print("\nOK: production chat within budget")
    return 0


if __name__ == "__main__":
    sys.exit(main())
