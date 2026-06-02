-- Dev seed: integration providers (run after migrate if Connect Apps lists are empty)
INSERT INTO "IntegrationProvider" ("id", "name", "authType", "scopes", "isEnabled", "updatedAt") VALUES
  ('google', 'Google Workspace', 'oauth2', ARRAY['gmail', 'calendar', 'drive'], true, CURRENT_TIMESTAMP),
  ('whatsapp', 'WhatsApp', 'device_link', ARRAY['messages'], true, CURRENT_TIMESTAMP),
  ('files', 'Files', 'local', ARRAY['read'], true, CURRENT_TIMESTAMP),
  ('notes', 'Notes', 'local', ARRAY['read', 'write'], true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
