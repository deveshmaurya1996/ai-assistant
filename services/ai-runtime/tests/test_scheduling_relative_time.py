from orchestration.scheduling_relative_time import (
    parse_relative_minutes,
    resolve_one_shot_next_fire_at,
)
from workflows.automation import _normalize_action


def test_parse_relative_minutes_one():
    assert parse_relative_minutes("remind me in 1 minute to drink water") == 1
    assert parse_relative_minutes("remind me in a minute") == 1


def test_parse_relative_minutes_numeric():
    assert parse_relative_minutes("remind me in 5 minutes") == 5


def test_parse_relative_minutes_none():
    assert parse_relative_minutes("remind me at 9pm") is None


def test_resolve_one_shot_next_fire_at():
    iso = resolve_one_shot_next_fire_at("remind me in 2 minutes", "UTC")
    assert iso is not None
    assert "T" in iso


def test_normalize_action_overrides_relative_next_fire_at():
    out = _normalize_action(
        {
            "tool": "reminder.create",
            "args": {
                "title": "Water",
                "userPrompt": "remind me in 1 minute to drink water",
                "nextFireAt": "2020-01-01T00:00:00",
                "recurrence": "NONE",
            },
        },
        "Asia/Kolkata",
    )
    assert out is not None
    assert out["args"]["nextFireAt"] != "2020-01-01T00:00:00"
    assert out["args"]["timezone"] == "Asia/Kolkata"
