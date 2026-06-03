import api.attachment_content as attachment_content


def test_attachment_excerpt_capped(monkeypatch):
    monkeypatch.setattr(attachment_content, "_attachment_excerpt_stream_max", lambda: 100)
    parts = attachment_content.attachment_text_parts(
        [{"filename": "a.pdf", "textExcerpt": "x" * 500}]
    )
    assert len(parts) == 1
    text = parts[0]["text"]
    assert "truncated" in text
    assert "x" * 101 not in text
