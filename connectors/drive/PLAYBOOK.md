# Google Drive

The assistant can search and read Google Drive when Google is connected.

## Capabilities

| Capability | Use for |
|------------|---------|
| `drive.search` | Find files by name or keywords |
| `drive.get_content` | Read a file's text for summarization or Q&A |

## Common scenarios

| User intent | Plan |
|-------------|------|
| "Find my resume in Drive" | `drive.search` |
| "Search Drive for budget spreadsheet" | `drive.search` |
| "Summarize the PDF about onboarding" | `drive.search` → `drive.get_content` with file id |
| "What's in my project plan doc?" | `drive.search` → `drive.get_content` |
| "List files about taxes" | `drive.search` |

## Rules

- Use `drive.search` before `drive.get_content` when the user refers to a file by name
- Summarize long documents from `drive.get_content` output; do not invent file contents
- Google Docs, Sheets, Slides, and PDFs are supported for text export where possible
- For searching across Gmail + WhatsApp + Drive together, use `resources.search`
