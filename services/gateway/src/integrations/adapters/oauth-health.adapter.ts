import { prisma } from '@ai-assistant/database';
import { getConnector } from '@ai-assistant/integration-runtime';
import { decryptCredentials, encryptCredentials } from '../../services/encryption.service';
import type { ConnectionHealthAdapter, ConnectionHealthResult, HealthContext } from '../types';
import { registerHealthAdapter } from '../health-registry';
import { getProviderDef } from '../provider-defs';

function createOAuthHealthAdapter(providerId: string): ConnectionHealthAdapter {
  return {
    providerId,
    async assess(ctx: HealthContext): Promise<ConnectionHealthResult> {
      const connector = getConnector(providerId);
      if (!connector?.healthCheck) {
        return { healthy: true };
      }

      const row = await prisma.userConnection.findFirst({
        where: {
          id: ctx.connection.id,
          userId: ctx.userId,
          providerId,
          status: 'ACTIVE',
        },
        select: { encryptedCredentials: true, metadata: true },
      });

      if (!row?.encryptedCredentials) {
        const label = getProviderDef(providerId)?.name ?? providerId;
        return {
          healthy: false,
          error: `${label} not linked — connect in Connect Apps.`,
        };
      }

      try {
        const raw = decryptCredentials(row.encryptedCredentials);
        const credentials = JSON.parse(raw) as Record<string, unknown>;
        const health = await connector.healthCheck(ctx.connection.id, credentials);
        const priorMeta = (row.metadata ?? {}) as Record<string, unknown>;
        const updateData: Record<string, unknown> = {
          metadata: {
            ...priorMeta,
            lastHealthCheckAt: new Date().toISOString(),
            ...(health.healthy
              ? { lastHealthError: null }
              : { lastHealthError: health.message ?? `${providerId} unhealthy` }),
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
          .update({ where: { id: ctx.connection.id }, data: updateData })
          .catch(() => undefined);

        return {
          healthy: health.healthy,
          error: health.healthy ? null : health.message ?? `${providerId} unhealthy`,
        };
      } catch {
        return {
          healthy: false,
          error: `${providerId} health check failed — reconnect in Connect Apps.`,
        };
      }
    },
  };
}

export function registerOAuthHealthAdapters(providerIds: string[]): void {
  for (const providerId of providerIds) {
    registerHealthAdapter(createOAuthHealthAdapter(providerId));
  }
}
