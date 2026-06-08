import { prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { enqueueIngestionJob } from '../lib/runtime-clients';
import { invalidateCognitiveManifestCache } from '../services/manifest-invalidation.service';

export async function markConnectionActive(params: {
  userId: string;
  connectionId: string;
  providerId: string;
}): Promise<void> {
  await prisma.userConnection.update({
    where: { id: params.connectionId },
    data: { status: 'ACTIVE' },
  });

  await publishEvent(EventNames.INTEGRATION_CONNECTED, {
    userId: params.userId,
    connectionId: params.connectionId,
    providerId: params.providerId,
    status: 'connected',
  });

  invalidateCognitiveManifestCache(params.userId);

  if (params.providerId === 'google' || params.providerId === 'files') {
    enqueueIngestionJob(`/v1/sync/${params.connectionId}`, undefined, 'sync');
  }
}

export async function markConnectionDisconnected(params: {
  userId: string;
  connectionId: string;
  providerId: string;
}): Promise<void> {
  await prisma.userConnection.update({
    where: { id: params.connectionId },
    data: { status: 'DISCONNECTED', encryptedCredentials: null },
  });

  await publishEvent(EventNames.INTEGRATION_DISCONNECTED, {
    userId: params.userId,
    connectionId: params.connectionId,
    providerId: params.providerId,
    status: 'disconnected',
  });

  invalidateCognitiveManifestCache(params.userId);
}

export async function markWhatsAppDisconnectedForUser(userId: string): Promise<void> {
  const connection = await prisma.userConnection.findFirst({
    where: { userId, providerId: 'whatsapp' },
    select: { id: true },
  });
  if (!connection) return;
  await markConnectionDisconnected({
    userId,
    connectionId: connection.id,
    providerId: 'whatsapp',
  });
}
