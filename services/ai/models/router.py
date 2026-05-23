import os
import asyncio
from typing import List, Dict, AsyncIterator, Optional


def resolve_models(preferred: Optional[str] = None) -> List[str]:
    primary = preferred or os.getenv("PRIMARY_MODEL", "gemini/gemini-1.5-flash")
    fallback = os.getenv("FALLBACK_MODEL", "gpt-4o-mini")
    ollama = os.getenv("OLLAMA_BASE_URL")
    models = [primary, fallback]
    if ollama:
        models.append("ollama/llama3.2")
    return list(dict.fromkeys(models))


async def stream_completion(
    messages: List[Dict[str, str]],
    preferred_model: Optional[str] = None,
) -> AsyncIterator[str]:
    has_gemini = bool(os.getenv("GEMINI_API_KEY"))
    has_openai = bool(os.getenv("OPENAI_API_KEY"))
    models = resolve_models(preferred_model)

    if has_gemini or has_openai:
        try:
            import litellm

            last_error = None
            for model_name in models:
                try:
                    if model_name.startswith("ollama/"):
                        litellm.api_base = os.getenv(
                            "OLLAMA_BASE_URL", "http://localhost:11434"
                        )

                    response = litellm.completion(
                        model=model_name,
                        messages=messages,
                        stream=True,
                    )
                    for chunk in response:
                        content = chunk.choices[0].delta.content
                        if content:
                            yield content
                    return
                except Exception as e:
                    last_error = e
                    continue

            if last_error:
                yield f"\n[All models failed: {last_error}]\n"
        except Exception as e:
            yield f"\n[LiteLLM error: {e}]\n"

    query = messages[-1]["content"] if messages else ""
    context = ""
    for m in messages:
        if m.get("role") == "system" and "Retrieved Context" in m.get("content", ""):
            context = m["content"]
    async for chunk in _simulation_stream(query, context):
        yield chunk


async def _simulation_stream(query: str, context_str: str) -> AsyncIterator[str]:
    yield "[Simulation Mode - No API keys configured]\n"
    await asyncio.sleep(0.02)
    if context_str:
        yield "Retrieved context was used.\n"
        response_text = (
            f"Based on context, here is a response to: {query}"
        )
    else:
        response_text = f"General response to: {query}"
    for word in response_text.split():
        yield f"{word} "
        await asyncio.sleep(0.03)
