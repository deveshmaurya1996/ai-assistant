from orchestration.calendar_time_range import resolve_calendar_time_range


def test_yesterday_range_uses_device_timezone():
    out = resolve_calendar_time_range(
        "what meetings did I have yesterday",
        timezone="Asia/Kolkata",
    )
    assert out is not None
    assert out["rangeLabel"] == "yesterday"
    assert out["timeMin"] < out["timeMax"]


def test_tomorrow_range():
    out = resolve_calendar_time_range("calendar tomorrow", timezone="UTC")
    assert out is not None
    assert out["rangeLabel"] == "tomorrow"


def test_no_relative_day_returns_none():
    assert resolve_calendar_time_range("upcoming meetings", timezone="UTC") is None
