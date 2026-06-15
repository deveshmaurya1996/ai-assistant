# Gmail (Google Email)

The assistant can manage Gmail when Google is connected. **Deleting emails is not supported.**

## Capabilities

| Capability | Use for |
|------------|---------|
| `email.list_unread` | Inbox unread list with subject and preview |
| `email.read_email` | Read one email by id or latest unread |
| `email.search` | Search by sender, subject, keywords, labels |
| `email.send_email` | Send a new email |
| `email.reply_email` | Reply in the same thread (sends immediately) |
| `email.compose_draft` | Save a new draft without sending |
| `email.draft_reply` | Save a reply draft without sending |
| `email.mark_starred` | Star or unstar an email |

## Common scenarios

| User intent | Plan |
|-------------|------|
| "Check my Gmail" / "unread emails" | `email.list_unread` |
| "Read the latest email" / "open that mail from HR" | `email.read_email` or `email.search` then `email.read_email` with id |
| "Emails from Amazon this week" | `email.search` with query |
| "Send email to boss about leave" | `email.send_email` (to, subject, body) |
| "Reply saying thanks" | `email.read_email` or `email.search` if thread unknown → `email.reply_email` |
| "Draft a reply but don't send" | `email.draft_reply` or `email.compose_draft` |
| "Star that email" | find message id → `email.mark_starred` |
| "Remind me to email John at 5pm" | **Scheduling planner** — `reminder.create`, not email tools |

## Rules

- Use `email.read_email` or `email.search` before reply/star when the user refers to a specific message
- Use `email.reply_email` when the user wants to send a reply; use `email.draft_reply` when they only want a draft
- Never attempt to delete or trash emails — explain that delete is not supported
- `email.send_email` and `email.reply_email` require user confirmation
- For cross-app search (email + WhatsApp + Drive), prefer `resources.search` when the user does not specify Gmail only
