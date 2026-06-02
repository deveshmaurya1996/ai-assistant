# Connectors

Provider implementations for external services. During migration, code lives in [`packages/integrations`](../packages/integrations).

Future layout:

```
connectors/
  google/
  whatsapp/
  files/
  notes/
```

Use `@ai-assistant/integrations` in application code until connectors are split per provider.
