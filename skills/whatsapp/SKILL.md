# WhatsApp Skill

## Capabilities

- `communication.chat.search` — find a chat by contact name
- `communication.message.send` — send a WhatsApp message

## Search Chats

**Capability:** `communication.chat.search`

**Arguments:**

- `query` (string, required) — contact name or partial match

**Permissions:** `whatsapp.read`

**Risk:** low

**Requires confirmation:** no

## Send Message

**Capability:** `communication.message.send`

**Arguments:**

- `to` (string, required) — JID or resolvable contact name
- `message` (string, required)

**Permissions:** `whatsapp.send`

**Risk:** high

**Requires confirmation:** yes

**Planning hint:** If `to` is a person name (not a JID with `@`), run `communication.chat.search` first, then send using the resolved JID.

**Provider:** `whatsapp` (maps to legacy tool `whatsapp.send_message`)
