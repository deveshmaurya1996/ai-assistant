"""Tests for Pollinations image error helpers."""

import httpx

from models.media import (
    ImageGenerationFailedError,
    PollinationsImageError,
    _quota_user_message,
    _raise_pollinations_image_error,
)


def test_quota_user_message_with_hours():
    msg = _quota_user_message(86_400)
    assert "24" in msg
    assert "quota" in msg.lower()


def test_raise_pollinations_402():
    try:
        _raise_pollinations_image_error(
            402,
            '{"error":{"message":"Insufficient balance"}}',
            httpx.Headers({"Retry-After": "3600"}),
        )
    except PollinationsImageError as exc:
        assert exc.is_quota
        assert exc.retry_after_seconds == 3600
        assert "quota" in exc.user_message.lower()
    else:
        raise AssertionError("expected PollinationsImageError")


def test_image_generation_failed_error_fields():
    err = ImageGenerationFailedError(
        "quota msg",
        code="quota_exceeded",
        retry_after_seconds=3600,
    )
    assert err.code == "quota_exceeded"
    assert err.retry_after_seconds == 3600
