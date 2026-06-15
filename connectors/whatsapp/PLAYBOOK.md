# WhatsApp

The assistant can manage linked-device WhatsApp when WhatsApp is connected. **Deleting messages or chats is not supported.**

## Capabilities

| Capability | Use for |
|------------|---------|
| `messaging.list_unread` | All unread chats with previews |
| `messaging.read_chat` | Recent messages in one conversation |
| `messaging.search_messages` | Search synced message history by keyword |
| `messaging.search_chats` / `communication.chat.search` | Find a chat by contact name or phone |
| `messaging.send_message` | Send a message now |

## Common scenarios

| User intent | Plan |
|-------------|------|
| "List my unread WhatsApp" / "any new messages?" | `messaging.list_unread` |
| "What did Sarah say?" / "read John's chat" | `messaging.search_chats` (find contact) → `messaging.read_chat` with `chatId`/`jid` |
| "Search WhatsApp for invoice" | `messaging.search_messages` |
| "Send hi to Devesh on WhatsApp" | `messaging.search_chats` if name not a phone/JID → `messaging.send_message` |
| "Message +91… saying I'll be late" | `messaging.send_message` with phone in `to` |
| "Schedule / remind me to text Mom at 9pm" | **Scheduling planner** — not here. Returns empty capabilities; scheduling handles `reminder.create`. |
| "Send WhatsApp to John tomorrow at 3pm" | **Scheduling planner** — use `reminder.create` with `userPrompt` preserving recipient + message. Auto-send at time is not a direct capability; user gets a nudge to send. |

## Rules

- If `to` is a person name (not a JID with `@` or full phone), run `messaging.search_chats` first
- Use `messaging.read_chat` after finding the chat when the user asks about a specific person's messages
- Never attempt to delete messages or chats — explain that delete is not supported
- `messaging.send_message` requires user confirmation before sending
- Scheduling, reminders, and recurring inbox checks are handled by the **scheduling planner** — return `{"capabilities":[]}` for those requests
