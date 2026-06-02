import { prisma } from '@ai-assistant/database';
import {
  buildIntegrationManifest,
  formatManifestForPlanner,
  type IntegrationManifest,
} from '@ai-assistant/capabilities';

export async function buildUserIntegrationManifest(userId: string): Promise<{
  manifest: IntegrationManifest;
  plannerText: string;
  connections: Array<{ id: string; providerId: string; status: string }>;
}> {
  const rows = await prisma.userConnection.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { id: true, providerId: true, status: true },
  });

  const connections = rows.map((c) => ({
    id: c.id,
    providerId: c.providerId,
    status: c.status,
  }));

  const manifest = buildIntegrationManifest(
    connections.map((c) => ({ id: c.id, providerId: c.providerId }))
  );

  return {
    manifest,
    plannerText: formatManifestForPlanner(manifest),
    connections,
  };
}
