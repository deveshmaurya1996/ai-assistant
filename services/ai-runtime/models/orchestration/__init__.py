from models.orchestration.circuit_breaker import circuit_breaker

__all__ = [
    "circuit_breaker",
    "stream_text_orchestrated",
    "complete_text_orchestrated",
]


def __getattr__(name: str):
    if name == "stream_text_orchestrated":
        from models.orchestration.completion_orchestrator import stream_text_orchestrated

        return stream_text_orchestrated
    if name == "complete_text_orchestrated":
        from models.orchestration.completion_orchestrator import complete_text_orchestrated

        return complete_text_orchestrated
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
