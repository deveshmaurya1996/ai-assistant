"""Tests for attachment message assembly in chat API."""

from api.attachment_content import user_content_from_attachments as _user_content_from_attachments


def test_text_only_attachment_includes_excerpt():
    content = _user_content_from_attachments(
        "Summarize this",
        [
            {
                "filename": "report.pdf",
                "textExcerpt": "Revenue grew 12% year over year.",
            }
        ],
    )
    assert isinstance(content, str)
    assert "Summarize this" in content
    assert "report.pdf" in content
    assert "Revenue grew" in content


def test_image_only_returns_multimodal_parts():
    content = _user_content_from_attachments(
        "",
        [
            {
                "filename": "photo.jpg",
                "imageDataUrl": "data:image/jpeg;base64,abc",
            }
        ],
    )
    assert isinstance(content, list)
    types = [p["type"] for p in content]
    assert "image_url" in types
    text_parts = [p for p in content if p.get("type") == "text"]
    assert text_parts
    assert "attached file" in text_parts[0]["text"].lower()


def test_attachment_only_with_excerpt_and_vision_includes_prompt():
    content = _user_content_from_attachments(
        "",
        [
            {
                "filename": "scan.pdf",
                "textExcerpt": "PDF scan.pdf: 2 page(s) for visual analysis.",
                "imageDataUrl": "data:image/png;base64,aaa",
            }
        ],
    )
    assert isinstance(content, list)
    text_parts = [p for p in content if p.get("type") == "text"]
    assert any("analyze" in p["text"].lower() for p in text_parts)


def test_pdf_without_user_text_uses_default_prompt():
    content = _user_content_from_attachments(
        "",
        [{"filename": "doc.txt", "textExcerpt": "Hello world"}],
    )
    assert isinstance(content, str)
    assert "Hello world" in content


def test_embedded_page_images_in_multimodal():
    content = _user_content_from_attachments(
        "Read this PDF",
        [
            {
                "filename": "scan.pdf",
                "textExcerpt": "Page 1",
                "imageDataUrl": "data:image/png;base64,aaa",
                "embeddedImageDataUrls": ["data:image/png;base64,bbb"],
            }
        ],
    )
    assert isinstance(content, list)
    image_parts = [p for p in content if p.get("type") == "image_url"]
    assert len(image_parts) == 2


def test_binary_note_included():
    content = _user_content_from_attachments(
        "",
        [{"note": "Binary file attached: data.bin"}],
    )
    assert isinstance(content, str)
    assert "Binary file attached" in content
