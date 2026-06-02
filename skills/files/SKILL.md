# File Intelligence

Use this skill when the user asks about uploaded documents, PDFs, spreadsheets, or images they attached in chat.

## Tools

- `files.search` — Find files and matching excerpts by query (requires indexed `ready` status).
- `files.get_summary` — Short summary for a specific `fileId`.
- `files.get_chunks` — Top relevant text chunks for a `fileId` and query.
- `files.analyze_image` — On-demand vision/OCR for an image `fileId` (not every chat turn).

## Rules

- Prefer registry + chunks over re-reading raw files.
- Do not request full file bytes in chat; use `fileId` references only.
- If status is not `ready`, tell the user indexing may still be in progress.
