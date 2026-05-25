import os

_otel_initialized = False
_langfuse_client = None


def init_observability() -> None:
    global _otel_initialized, _langfuse_client

    if os.getenv("OTEL_ENABLED", "").lower() == "true" and not _otel_initialized:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.semconv.resource import ResourceAttributes

        service_name = os.getenv("OTEL_SERVICE_NAME_AI", "ai-assistant-ai")
        endpoint = os.getenv(
            "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318"
        ).rstrip("/")
        if not endpoint.endswith("/v1/traces"):
            endpoint = f"{endpoint}/v1/traces"

        provider = TracerProvider(
            resource=Resource.create({ResourceAttributes.SERVICE_NAME: service_name})
        )
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
        trace.set_tracer_provider(provider)
        _otel_initialized = True

    langfuse_host = os.getenv("LANGFUSE_HOST")
    if langfuse_host and _langfuse_client is None:
        try:
            from langfuse import Langfuse

            _langfuse_client = Langfuse(
                public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
                secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
                host=langfuse_host,
            )
        except Exception:
            _langfuse_client = None


def instrument_fastapi(app) -> None:
    if os.getenv("OTEL_ENABLED", "").lower() != "true":
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app)
    except Exception:
        pass


def get_langfuse():
    return _langfuse_client


def langfuse_span(name: str, **kwargs):
    from contextlib import contextmanager

    @contextmanager
    def _span():
        client = get_langfuse()
        if client is None:
            yield None
            return
        trace_obj = client.trace(name=name, **kwargs)
        try:
            yield trace_obj
        finally:
            trace_obj.end()

    return _span()
