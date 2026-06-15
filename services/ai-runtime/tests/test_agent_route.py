from fastapi import FastAPI

from api.agent import router as agent_router


def test_agent_turn_route_mounted():
    app = FastAPI()
    app.include_router(agent_router)
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/v1/agent/turn" in paths
