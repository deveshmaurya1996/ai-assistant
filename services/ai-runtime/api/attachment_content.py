from __future__ import annotations

from typing import Any, Dict, List, Union


def collect_vision_urls(resolved_attachments: List[Dict[str, Any]]) -> List[str]:
    urls: List[str] = []
    for item in resolved_attachments:
        primary = item.get("imageDataUrl")
        if primary:
            urls.append(str(primary))
        for extra in item.get("embeddedImageDataUrls") or []:
            if extra:
                urls.append(str(extra))
    return urls


def default_attachment_query(resolved_attachments: List[Dict[str, Any]]) -> str:
    if collect_vision_urls(resolved_attachments):
        return (
            "Describe and analyze the attached file(s), "
            "including any images or scanned pages."
        )
    return (
        "Analyze the attached file(s) and summarize the key details, "
        "structure, and important information."
    )


def attachment_text_parts(
    resolved_attachments: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    parts: List[Dict[str, Any]] = []
    for item in resolved_attachments:
        excerpt = item.get("textExcerpt")
        if excerpt:
            filename = item.get("filename", "file")
            parts.append(
                {
                    "type": "text",
                    "text": f"[Attached file: {filename}]\n{excerpt}",
                }
            )
        note = item.get("note")
        if note:
            parts.append({"type": "text", "text": f"[{note}]"})
    return parts


def user_content_from_attachments(
    query: str, resolved_attachments: List[Dict[str, Any]]
) -> Union[str, List[Dict[str, Any]]]:
    vision_urls = collect_vision_urls(resolved_attachments)
    file_parts = attachment_text_parts(resolved_attachments)
    effective_query = query.strip()
    if not effective_query and resolved_attachments:
        effective_query = default_attachment_query(resolved_attachments)

    if not vision_urls:
        text_blocks: List[str] = []
        if effective_query:
            text_blocks.append(effective_query)
        for part in file_parts:
            text_blocks.append(str(part.get("text", "")))
        if text_blocks:
            return "\n\n".join(text_blocks)
        return query

    parts: List[Dict[str, Any]] = []
    if effective_query:
        parts.append({"type": "text", "text": effective_query})
    parts.extend(file_parts)
    for url in vision_urls:
        parts.append({"type": "image_url", "image_url": {"url": url}})
    return parts
