import pytest

from models.config_loader import load_ai_models_config
from llm import model_health, ranking, redis_store


@pytest.fixture(autouse=True)
def _reset():
    redis_store._memory.clear()
    redis_store._redis_client = None
    redis_store._redis_checked = False
    load_ai_models_config(reload=True)


@pytest.mark.asyncio
async def test_low_sample_confidence_reduces_score():
    await model_health.record_request(
        "nvidia/deepseek-v4-flash",
        task="fast_chat",
        latency_ms=500,
        success=True,
    )
    await model_health.record_request(
        "nvidia/deepseek-v4-flash",
        task="fast_chat",
        latency_ms=500,
        success=True,
    )
    for _ in range(100):
        await model_health.record_request(
            "nvidia/glm-5.1",
            task="fast_chat",
            latency_ms=800,
            success=True,
        )
    ranked = await ranking.rank_models_for_task(
        ["nvidia/deepseek-v4-flash", "nvidia/glm-5.1"],
        "fast_chat",
    )
    assert len(ranked) == 2
    flash = next(r for r in ranked if r["modelId"] == "nvidia/deepseek-v4-flash")
    glm = next(r for r in ranked if r["modelId"] == "nvidia/glm-5.1")
    assert flash["sampleCount1h"] < glm["sampleCount1h"]
    assert glm["score"] >= flash["score"] * 0.5


@pytest.mark.asyncio
async def test_effective_tiers_returns_structure():
    tiers = await ranking.effective_tiers_for_task("fast_chat")
    assert "tier1" in tiers
    assert "tier2" in tiers
    assert "tier3" in tiers
