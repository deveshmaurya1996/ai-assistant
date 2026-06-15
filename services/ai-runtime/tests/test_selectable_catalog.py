import pytest

from models.config_loader import list_model_defs, load_ai_models_config, user_selectable
from models.selectable_catalog import build_selectable_models
from llm import redis_store


@pytest.fixture(autouse=True)
def _reset():
    redis_store._memory.clear()
    redis_store._redis_client = None
    redis_store._redis_checked = False
    load_ai_models_config(reload=True)


def test_user_selectable_includes_chat_models_beyond_router_pilot():
    selectable = [e["id"] for e in list_model_defs() if user_selectable(e["id"])]
    assert "nvidia/deepseek-v4-flash" in selectable
    assert "groq/llama-3.1-8b" in selectable
    assert "pollinations/openai" in selectable
    assert "nvidia/nv-embed-v1" not in selectable
    assert "pollinations/whisper-1" not in selectable
    assert len(selectable) > 12


@pytest.mark.asyncio
async def test_selectable_models_priority_sorted(monkeypatch):
    monkeypatch.setattr(
        "models.selectable_catalog.model_is_available",
        lambda _model_id: True,
    )

    async def _always_available(*_args, **_kwargs):
        return True

    monkeypatch.setattr("llm.model_health.is_available", _always_available)
    payload = await build_selectable_models("fast_chat")
    models = payload["models"]
    assert len(models) > 12
    priorities = [m["priority"] for m in models]
    assert priorities == sorted(priorities)
    assert isinstance(payload["routingOrder"], list)
    assert len(payload["routingOrder"]) >= 1
