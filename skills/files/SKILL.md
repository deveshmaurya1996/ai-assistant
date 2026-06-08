# File Intelligence

Use this skill when the user asks about uploaded documents, PDFs, spreadsheets, Drive files, or images they attached in chat.

## Capabilities

- `files.search_documents` — search Drive (google) and/or uploaded files (files provider)
- `files.search` — search indexed uploads by query (legacy tool for files provider)

## Tools

- `files.search` — find files and matching excerpts by query (requires indexed `ready` status)
- `files.get_summary` — short summary for a specific `fileId`
- `files.get_chunks` — top relevant text chunks for a `fileId` and query
- `files.analyze_image` — on-demand vision/OCR for an image `fileId`

## Rules

- Prefer registry + chunks over re-reading raw files
- Do not request full file bytes in chat; use `fileId` references only
- If status is not `ready`, tell the user indexing may still be in progress
- When both Google and Files are connected, search uploads and Drive separately if needed
