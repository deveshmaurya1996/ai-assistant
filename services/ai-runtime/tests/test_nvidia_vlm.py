"""Tests for NVIDIA VLM (PaliGemma) message conversion."""

import pytest

from models.providers.nvidia_vlm import (
    VlmNoImageError,
    messages_to_vlm_content,
    vlm_endpoint_url,
)


def test_vlm_endpoint_url_default():
    assert vlm_endpoint_url("google/paligemma") == (
        "https://ai.api.nvidia.com/v1/vlm/google/paligemma"
    )


def test_messages_to_vlm_content_with_data_url():
    content = messages_to_vlm_content(
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe the image."},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/jpeg;base64,abc123"},
                    },
                ],
            }
        ]
    )
    assert "Describe the image." in content
    assert '<img src="data:image/jpeg;base64,abc123" />' in content


def test_messages_to_vlm_content_requires_image():
    with pytest.raises(VlmNoImageError):
        messages_to_vlm_content(
            [{"role": "user", "content": "text only, no image"}]
        )
