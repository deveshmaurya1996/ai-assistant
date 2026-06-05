import { prisma } from '@ai-assistant/database';

const PROVIDER_DEFS: Record<
  string,
  { name: string; authType: string; scopes: string[] }
> = {
  google: {
    name: 'Google Workspace',
    authType: 'oauth2',
    scopes: ['gmail', 'calendar', 'drive'],
  },
  whatsapp: {
    name: 'WhatsApp',
    authType: 'device_link',
    scopes: ['messages'],
  },
  files: {
    name: 'Files',
    authType: 'local',
    scopes: ['read'],
  }
};

export async function ensureIntegrationProvider(providerId: string): Promise<void> {
  const def = PROVIDER_DEFS[providerId];
  if (!def) {
    throw new Error(`Unknown integration provider: ${providerId}`);
  }

  await prisma.integrationProvider.upsert({
    where: { id: providerId },
    create: {
      id: providerId,
      name: def.name,
      authType: def.authType,
      scopes: def.scopes,
      isEnabled: true,
    },
    update: {},
  });
}
