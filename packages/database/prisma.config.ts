import '@ai-assistant/config/register';
import { config } from '@ai-assistant/config';
import { defineConfig } from '@prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: config.databaseUrl,
  },
});
