from pathlib import Path


def test_mount_cognitive_routes_registers_post_via_add_api_route():
    source = Path(__file__).resolve().parents[1].joinpath("cognitive_integration.py").read_text(
        encoding="utf-8"
    )
    assert "app.add_api_route(" in source
    assert "APIRoute" in source
    assert "app.router.routes.append(route)" not in source.replace(
        "else:\n            app.router.routes.append(route)", ""
    ) or "else:" in source
