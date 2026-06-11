# Google Drive

The assistant can search and read Google Drive when Google is connected.

## Capabilities

| Capability | Use for |
|------------|---------|
| `drive.search` | Find files by name or keywords |
| `drive.get_content` | Read a file's text for summarization |

## Rules

- Use `drive.search` before `drive.get_content` when the user refers to a file by name
- Summarize long documents; do not invent file contents
