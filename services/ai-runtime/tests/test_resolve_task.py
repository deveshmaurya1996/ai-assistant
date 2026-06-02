
from api.chat import resolve_task_for_payload


def test_text_attachment_uses_fast_chat_not_reasoning():
    task = resolve_task_for_payload(
        "Summarize",
        "reasoning",
        [{"filename": "a.pdf", "textExcerpt": "Annual revenue was 12%."}],
    )
    assert task == "fast_chat"


def test_image_attachment_uses_file_analysis():
    task = resolve_task_for_payload(
        "Describe",
        "fast_chat",
        [{"filename": "a.jpg", "imageDataUrl": "data:image/jpeg;base64,abc"}],
    )
    assert task == "file_analysis"


def test_embedded_images_use_file_analysis():
    task = resolve_task_for_payload(
        "",
        "auto",
        [
            {
                "filename": "scan.pdf",
                "textExcerpt": "Page render",
                "imageDataUrl": "data:image/png;base64,abc",
                "embeddedImageDataUrls": ["data:image/png;base64,def"],
            }
        ],
    )
    assert task == "file_analysis"
