import { prisma } from '@ai-assistant/database';
import { GoogleConnector } from '@ai-assistant/integrations';
import { resolveBridgeSessionForUser } from '../whatsapp/session-resolve';
import { decryptCredentials, encryptCredentials } from './encryption.service';

const googleConnector = new GoogleConnector();

export async function assessConnectionHealth(
  userId: string,
  connection: { id: string; providerId: string; status: string }
): Promise<boolean> {
  if (connection.status !== 'ACTIVE') return false;

  if (connection.providerId === 'whatsapp') {
    const resolved = await resolveBridgeSessionForUser(userId, connection.id);
    return Boolean(resolved);
  }

  if (connection.providerId === 'google') {
    const row = await prisma.userConnection.findFirst({
      where: { id: connection.id, userId, providerId: 'google', status: 'ACTIVE' },
      select: { encryptedCredentials: true },
    });
    if (!row?.encryptedCredentials) return false;

    try {
      const raw = decryptCredentials(row.encryptedCredentials);
      const credentials = JSON.parse(raw) as Record<string, unknown>;
      const health = await googleConnector.healthCheck(connection.id, credentials);
      const updateData: Record<string, unknown> = {
        metadata: {
          lastHealthCheckAt: new Date().toISOString(),
          ...(health.healthy
            ? { lastHealthError: null }
            : { lastHealthError: health.message ?? 'Google unhealthy' }),
        },
      };
      if (health.refreshedCredentials) {
        updateData.encryptedCredentials = encryptCredentials(
          JSON.stringify(health.refreshedCredentials)
        );
        const expiresIn = health.refreshedCredentials.expires_in;
        if (typeof expiresIn === 'number') {
          updateData.expiresAt = new Date(Date.now() + expiresIn * 1000);
        }
      }
      await prisma.userConnection
        .update({ where: { id: connection.id }, data: updateData })
        .catch(() => undefined);
      return health.healthy;
    } catch {
      return false;
    }
  }

  return true;
}

export async function assessConnectionsHealth(
  userId: string,
  connections: Array<{ id: string; providerId: string; status: string }>
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  await Promise.all(
    connections.map(async (connection) => {
      results.set(connection.id, await assessConnectionHealth(userId, connection));
    })
  );
  return results;
}
