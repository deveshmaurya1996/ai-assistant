# Gmail (Google Email)

The assistant can manage Gmail when Google is connected. **Deleting emails is not supported.**

## Capabilities

| Capability | Use for |
|------------|---------|
| `email.list_unread` | Inbox unread list with previews |
| `email.read_email` | Read one email by id or latest unread |
| `email.search` | Search by sender, subject, or keywords |
| `email.send_email` | Send a new email |
| `email.reply_email` | Reply in the same thread (sends immediately) |
| `email.compose_draft` | Save a new draft without sending |
| `email.draft_reply` | Save a reply draft without sending |
| `email.mark_starred` | Star or unstar an email |

## Rules

- Use `email.read_email` or `email.search` before reply/star when the user refers to a specific message
- Use `email.reply_email` when the user wants to send a reply; use `email.draft_reply` when they only want a draft
- Never attempt to delete or trash emails — explain that delete is not supported
- Send and reply require user confirmation
