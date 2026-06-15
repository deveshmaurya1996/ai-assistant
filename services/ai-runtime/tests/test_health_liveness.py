from main import app


def test_liveness_routes_available_before_bootstrap():
    paths = app.openapi().get("paths", {})
    assert "/health" in paths
    assert "/health/ready" in paths


def test_agent_routes_are_deferred_until_bootstrap():
    paths = app.openapi().get("paths", {})
    assert "/v1/agent/turn" not in paths
