# Gmail Skill

## Capabilities

- `email.list_unread` — list unread emails with subject and preview
- `email.read_email` — read a single email by id or latest unread
- `email.send_email` — send an email

## List Unread

**Capability:** `email.list_unread`

**Arguments:**

- `maxResults` (number, optional)

**Permissions:** `gmail.read`

**Risk:** low

## Read Email

**Capability:** `email.read_email`

**Arguments:**

- `messageId` (string, optional) — omit for latest unread

**Permissions:** `gmail.read`

**Risk:** low

## Send Email

**Capability:** `email.send_email`

**Arguments:**

- `to` (string, required) — recipient email
- `subject` (string, required)
- `body` (string, required)

**Permissions:** `gmail.send`

**Risk:** high

**Requires confirmation:** yes

**Provider:** `google`
