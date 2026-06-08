import { prisma } from '@ai-assistant/database';
import {
  buildIntegrationManifest,
  formatManifestForPlanner,
  type IntegrationManifest,
} from '@ai-assistant/capabilities';
import { assessConnectionsHealth } from './integration-health.service';

async function ensureFilesConnectionForUploads(userId: string): Promise<void> {
  const connectionId = `files_${userId}`;
  const hasFiles = await prisma.fileAsset.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!hasFiles) return;

  await prisma.userConnection.upsert({
    where: { id: connectionId },
    create: {
      id: connectionId,
      userId,
      providerId: 'files',
      status: 'ACTIVE',
      scopes: [],
    },
    update: { status: 'ACTIVE' },
  });
}

export async function buildUserIntegrationManifest(userId: string): Promise<{
  manifest: IntegrationManifest;
  plannerText: string;
  connections: Array<{ id: string; providerId: string; status: string }>;
  unhealthyNotes: string[];
}> {
  await ensureFilesConnectionForUploads(userId);

  const rows = await prisma.userConnection.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { id: true, providerId: true, status: true },
  });

  const health = await assessConnectionsHealth(userId, rows);
  const healthyRows = rows.filter((row) => health.get(row.id) === true);
  const unhealthyNotes: string[] = [];

  for (const row of rows) {
    if (health.get(row.id) === true) continue;
    unhealthyNotes.push(
      `${row.providerId} is linked in the app but offline — reconnect in Connect Apps.`
    );
  }

  const connections = healthyRows.map((c) => ({
    id: c.id,
    providerId: c.providerId,
    status: c.status,
  }));

  const manifest = buildIntegrationManifest(
    connections.map((c) => ({ id: c.id, providerId: c.providerId }))
  );

  let plannerText = formatManifestForPlanner(manifest);
  if (unhealthyNotes.length > 0) {
    plannerText += `\n\nOffline integrations (do not use until reconnected):\n${unhealthyNotes.map((n) => `- ${n}`).join('\n')}`;
  }

  return {
    manifest,
    plannerText,
    connections,
    unhealthyNotes,
  };
}
