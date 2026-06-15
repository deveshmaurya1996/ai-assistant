import { prisma } from '@ai-assistant/database';
import { assessProviderHealth, registerIntegrationAdapters } from '../integrations';
import type { ConnectionHealthResult } from '../integrations';

registerIntegrationAdapters();

export type { ConnectionHealthResult };

export async function assessConnectionHealth(
  userId: string,
  connection: { id: string; providerId: string; status: string }
): Promise<ConnectionHealthResult> {
  if (connection.status !== 'ACTIVE') return { healthy: false };
  return assessProviderHealth({ userId, connection });
}

export async function assessConnectionsHealth(
  userId: string,
  connections: Array<{ id: string; providerId: string; status: string }>
): Promise<Map<string, ConnectionHealthResult>> {
  const results = new Map<string, ConnectionHealthResult>();
  await Promise.all(
    connections.map(async (connection) => {
      results.set(connection.id, await assessConnectionHealth(userId, connection));
    })
  );
  return results;
}
