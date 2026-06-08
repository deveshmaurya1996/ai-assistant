# WhatsApp Skill

## Capabilities

- `messaging.list_unread` — list unread chats with previews
- `messaging.read_chat` — read recent messages in a conversation
- `messaging.send_message` — send a WhatsApp message
- `communication.chat.search` — find a chat by contact name (use before send when `to` is a name)

## List Unread

**Capability:** `messaging.list_unread`

**Arguments:**

- `limit` (number, optional) — max chats to return

**Permissions:** `whatsapp.read`

**Risk:** low

## Read Chat

**Capability:** `messaging.read_chat`

**Arguments:**

- `chatId` or `jid` (string, optional)
- `limit` (number, optional)

**Permissions:** `whatsapp.read`

**Risk:** low

## Search Chats

**Capability:** `communication.chat.search`

**Arguments:**

- `query` (string, required) — contact name or partial match

**Permissions:** `whatsapp.read`

**Risk:** low

## Send Message

**Capability:** `messaging.send_message`

**Arguments:**

- `to` (string, required) — JID or resolvable contact name
- `message` (string, required)

**Permissions:** `whatsapp.send`

**Risk:** high

**Requires confirmation:** yes

**Planning hint:** If `to` is a person name (not a JID with `@`), run `communication.chat.search` first, then send using the resolved JID.

**Provider:** `whatsapp`
