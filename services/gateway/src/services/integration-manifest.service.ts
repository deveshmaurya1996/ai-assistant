import { prisma } from '@ai-assistant/database';
import {
  buildIntegrationManifest,
  formatManifestForPlanner,
  type ConnectionStateKind,
  type IntegrationManifest,
  type ProviderConnectionState,
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

function resolveProviderState(
  providerId: string,
  connections: Array<{ id: string; providerId: string; status: string }>,
  health: Map<string, boolean>
): ConnectionStateKind {
  const row = connections.find((c) => c.providerId === providerId);
  if (!row || row.status !== 'ACTIVE') return 'not_connected';
  return health.get(row.id) === true ? 'ready' : 'offline';
}

export async function buildUserIntegrationManifest(userId: string): Promise<{
  manifest: IntegrationManifest;
  plannerText: string;
  connections: Array<{ id: string; providerId: string; status: string }>;
  connectionStates: ProviderConnectionState[];
  supportedProviders: string[];
  unhealthyNotes: string[];
}> {
  await ensureFilesConnectionForUploads(userId);

  const enabledProviders = await prisma.integrationProvider.findMany({
    where: { isEnabled: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const supportedProviders = enabledProviders.map((p) => p.id);

  const allConnections = await prisma.userConnection.findMany({
    where: { userId },
    select: { id: true, providerId: true, status: true },
    orderBy: { updatedAt: 'desc' },
  });

  const activeRows = allConnections.filter((c) => c.status === 'ACTIVE');
  const health = await assessConnectionsHealth(userId, activeRows);
  const healthyRows = activeRows.filter((row) => health.get(row.id) === true);
  const unhealthyNotes: string[] = [];

  for (const row of activeRows) {
    if (health.get(row.id) === true) continue;
    unhealthyNotes.push(
      `${row.providerId} is linked in the app but offline — reconnect in Connect Apps.`
    );
  }

  const connectionStates: ProviderConnectionState[] = supportedProviders.map((providerId) => {
    const row = allConnections.find((c) => c.providerId === providerId);
    const state = resolveProviderState(providerId, allConnections, health);
    return {
      providerId,
      state,
      connectionId: row?.id,
    };
  });

  const connections = healthyRows.map((c) => ({
    id: c.id,
    providerId: c.providerId,
    status: c.status,
  }));

  const manifest = buildIntegrationManifest(
    connections.map((c) => ({ id: c.id, providerId: c.providerId }))
  );

  const plannerText = formatManifestForPlanner(manifest, {
    supportedProviders,
    connectionStates,
  });

  return {
    manifest,
    plannerText,
    connections,
    connectionStates,
    supportedProviders,
    unhealthyNotes,
  };
}
