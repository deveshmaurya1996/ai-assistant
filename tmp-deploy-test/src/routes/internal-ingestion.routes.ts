import type { FastifyInstance } from 'fastify';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { enqueueIngestionJob } from '../workers/ingestion.worker';

export async function internalIngestionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/ingestion/sync/:connectionId', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    await enqueueIngestionJob('sync', { connectionId });
    return reply.code(202).send({ queued: true });
  });

  app.post('/ingestion/webhooks/gmail', async (request) => {
    const body = request.body as { userId?: string; messageId?: string; subject?: string };
    if (body.userId) {
      await publishEvent(EventNames.MESSAGE_RECEIVED, {
        userId: body.userId,
        connectionId: 'gmail',
        providerId: 'google',
        externalId: body.messageId ?? 'unknown',
        subject: body.subject,
      });
    }
    return { received: true };
  });

  app.post('/ingestion/webhooks/whatsapp', async (request) => {
    const body = request.body as {
      userId?: string;
      sessionId?: string;
      from?: string;
      text?: string;
    };
    if (body.userId) {
      await publishEvent(EventNames.MESSAGE_RECEIVED, {
        userId: body.userId,
        connectionId: body.sessionId ?? 'whatsapp',
        providerId: 'whatsapp',
        externalId: body.from ?? 'unknown',
        snippet: body.text,
      });
    }
    return { received: true };
  });

  app.post('/ingestion/files/index', async (request, reply) => {
    const body = request.body as { userId: string; fileAssetId: string };
    await enqueueIngestionJob('index-file', body);
    return reply.code(202).send({ queued: true });
  });
}
