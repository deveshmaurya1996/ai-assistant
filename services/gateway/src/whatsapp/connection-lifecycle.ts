import { prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { enqueueIngestionJob } from '../lib/runtime-clients';

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

  if (params.providerId === 'google' || params.providerId === 'files') {
    enqueueIngestionJob(`/v1/sync/${params.connectionId}`, undefined, 'sync');
  }
}
