import pytest

from models.config_loader import load_ai_models_config, runtime_router_model_ids
from llm import model_health, overrides, redis_store


@pytest.fixture(autouse=True)
def _reset_memory_store():
    redis_store._memory.clear()
    redis_store._redis_client = None
    redis_store._redis_checked = False
    overrides._overrides.clear()
    load_ai_models_config(reload=True)


@pytest.mark.asyncio
async def test_record_request_updates_stats():
    await model_health.record_request(
        "nvidia/deepseek-v4-flash",
        task="fast_chat",
        latency_ms=1200,
        success=True,
    )
    stats = await model_health.get_stats_1h("nvidia/deepseek-v4-flash")
    assert stats["requestCount1h"] == 1
    assert stats["sampleCount1h"] == 1
    assert stats["successRate1h"] == 1.0


@pytest.mark.asyncio
async def test_quarantine_blocks_availability():
    overrides.set_override(
        "nvidia/deepseek-v4-flash",
        overrides.ModelOverride(quarantined=True),
    )
    state = await model_health.get_effective_state("nvidia/deepseek-v4-flash")
    assert state == "quarantined"


@pytest.mark.asyncio
async def test_maintenance_mode_allows_sticky_session(monkeypatch):
    monkeypatch.setattr(
        "models.model_resolver.model_is_available",
        lambda _model_id: True,
    )
    overrides.set_override(
        "nvidia/deepseek-v4-flash",
        overrides.ModelOverride(maintenance_mode=True),
    )
    blocked = await model_health.is_available("nvidia/deepseek-v4-flash")
    allowed = await model_health.is_available(
        "nvidia/deepseek-v4-flash",
        session_model_id="nvidia/deepseek-v4-flash",
    )
    assert blocked is False
    assert allowed is True


def test_router_eligible_models_from_catalog():
    ids = runtime_router_model_ids()
    assert len(ids) >= 12
    assert "nvidia/deepseek-v4-flash" in ids
    assert "nvidia/qwen3.5-397b" in ids
    assert all(mid for mid in ids)
