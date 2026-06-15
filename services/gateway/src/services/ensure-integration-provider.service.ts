import { prisma } from '@ai-assistant/database';
import { PROVIDER_DEFS } from '../integrations/provider-defs';

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
    update: {
      name: def.name,
      authType: def.authType,
      scopes: def.scopes,
      isEnabled: true,
    },
  });
}

export async function bootstrapIntegrationProviders(): Promise<void> {
  await Promise.all(
    Object.keys(PROVIDER_DEFS).map((providerId) => ensureIntegrationProvider(providerId))
  );
}
