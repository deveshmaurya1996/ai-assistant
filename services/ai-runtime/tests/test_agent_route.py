from fastapi import FastAPI

from api.agent import router as agent_router


def test_agent_turn_route_mounted():
    app = FastAPI()
    app.include_router(agent_router)
    assert "/v1/agent/turn" in app.openapi().get("paths", {})
