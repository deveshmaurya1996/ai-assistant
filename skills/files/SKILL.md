# Google Drive

Use this skill when the user asks to find, read, or summarize files in Google Drive.

## Capabilities

- `drive.search` — find Drive files by name or content (requires Google connected)
- `drive.get_content` — read/export a file as text for summarization

## Workflow

1. Use `drive.search` to find the relevant file(s)
2. Use `drive.get_content` with the `fileId` from search results
3. Summarize the returned `content` for the user

## Rules

- Drive is part of the Google integration (Gmail, Calendar, Drive)
- If Google is not connected, prompt the user to link Google in Connect Apps
- For summarize requests, always fetch content with `drive.get_content` before answering
