-- AUTO-GENERATED from catalog/providers.yaml — do not edit by hand
INSERT INTO "IntegrationProvider" ("id", "name", "authType", "scopes", "isEnabled", "updatedAt") VALUES
  ('google', 'Google Workspace', 'oauth2', ARRAY['gmail', 'calendar', 'drive'], true, CURRENT_TIMESTAMP),
  ('whatsapp', 'WhatsApp', 'device_link', ARRAY['messages'], true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
