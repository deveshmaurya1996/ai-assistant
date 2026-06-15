import { prisma } from '@ai-assistant/database';
import {
  buildIntegrationManifest,
  formatManifestForPlanner,
  type ConnectionStateKind,
  type IntegrationManifest,
  type ProviderConnectionState,
} from '@ai-assistant/capabilities';
import { formatConnectorsForPlanner } from '@ai-assistant/connectors';
import { assessConnectionsHealth, type ConnectionHealthResult } from './integration-health.service';
import { bootstrapIntegrationProviders } from './ensure-integration-provider.service';

function resolveProviderState(
  providerId: string,
  connections: Array<{ id: string; providerId: string; status: string }>,
  health: Map<string, ConnectionHealthResult>
): ConnectionStateKind {
  const row = connections.find((c) => c.providerId === providerId);
  if (!row || row.status !== 'ACTIVE') return 'not_connected';
  return health.get(row.id)?.healthy === true ? 'ready' : 'offline';
}

export async function buildUserIntegrationManifest(userId: string): Promise<{
  manifest: IntegrationManifest;
  plannerText: string;
  connections: Array<{ id: string; providerId: string; status: string }>;
  connectionStates: ProviderConnectionState[];
  supportedProviders: string[];
  unhealthyNotes: string[];
}> {
  await bootstrapIntegrationProviders();

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
  const healthyRows = activeRows.filter((row) => health.get(row.id)?.healthy === true);
  const unhealthyNotes: string[] = [];

  for (const row of activeRows) {
    if (health.get(row.id)?.healthy === true) continue;
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

  const basePlannerText = formatManifestForPlanner(manifest, {
    supportedProviders,
    connectionStates,
  });

  const readyProviderIds = connectionStates
    .filter((s) => s.state === 'ready')
    .map((s) => s.providerId);
  const connectorBlock = formatConnectorsForPlanner(readyProviderIds);
  const plannerText = connectorBlock
    ? `${basePlannerText}\n\n---\n\n${connectorBlock}`
    : basePlannerText;

  return {
    manifest,
    plannerText,
    connections,
    connectionStates,
    supportedProviders,
    unhealthyNotes,
  };
}
