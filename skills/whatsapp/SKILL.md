# WhatsApp

The assistant can manage linked-device WhatsApp when WhatsApp is connected. **Deleting messages or chats is not supported.**

## Capabilities

| Capability | Use for |
|------------|---------|
| `messaging.list_unread` | Unread chats with previews |
| `messaging.read_chat` | Recent messages in a conversation |
| `messaging.search_messages` | Search synced message history |
| `communication.chat.search` | Find a chat by contact name |
| `messaging.send_message` | Send a message |

## Rules

- If `to` is a person name (not a JID with `@`), run `communication.chat.search` first
- Never attempt to delete messages or chats — explain that delete is not supported
- Sending requires user confirmation
