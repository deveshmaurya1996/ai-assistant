# Gmail Skill

## Capabilities

- `communication.email.search` — search the user's mailbox
- `communication.email.send` — send an email

## Search Email

**Capability:** `communication.email.search`

**Arguments:**

- `query` (string, required) — Gmail search query
- `maxResults` (number, optional)

**Permissions:** `gmail.read`

**Risk:** low

**Requires confirmation:** no

## Send Email

**Capability:** `communication.email.send`

**Arguments:**

- `to` (string, required) — recipient email
- `subject` (string, required)
- `body` (string, required)

**Permissions:** `gmail.send`

**Risk:** high

**Requires confirmation:** yes (external recipients)

**Provider:** `google` (maps to legacy tool `gmail.send`)
