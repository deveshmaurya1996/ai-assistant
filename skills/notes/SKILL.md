# Notes Skill

## Capabilities

- `productivity.note.create` — save a note for the user
- `productivity.note.search` — search saved notes

## Create Note

**Capability:** `productivity.note.create`

**Arguments:**

- `content` (string, required)
- `title` (string, optional) — auto-generated from content if omitted

**Permissions:** `notes.write`

**Risk:** low

**Requires confirmation:** yes (inline confirm in chat)

## Search Notes

**Capability:** `productivity.note.search`

**Arguments:**

- `query` (string, required)

**Permissions:** `notes.read`

**Risk:** low

**Requires confirmation:** no
