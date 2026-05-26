import Fastify from 'fastify';
import { Queue, Worker } from 'bullmq';
import { config } from '@ai-assistant/config';
import { prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { getConnector } from '@ai-assistant/integrations';
import { decryptCredentials } from './encryption';

const PORT = parseInt(process.env.INGESTION_ENGINE_PORT ?? '3012', 10);

function getConnection() {
  return { url: config.redisUrl };
}

const syncQueue = new Queue('sync-queue', { connection: getConnection() });

async function syncConnection(connectionId: string) {
  const conn = await prisma.userConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.status !== 'ACTIVE' || !conn.encryptedCredentials) return;

  const connector = getConnector(conn.providerId);
  if (!connector?.sync) return;

  const credentials = JSON.parse(decryptCredentials(conn.encryptedCredentials));
  const result = await connector.sync(connectionId, credentials);

  await prisma.userConnection.update({
    where: { id: connectionId },
    data: { lastSyncAt: new Date() },
  });

  await publishEvent(EventNames.INTEGRATION_SYNCED, {
    userId: conn.userId,
    connectionId,
    providerId: conn.providerId,
    status: 'synced',
    resourceCount: result.resourcesIndexed,
  });
}

async function main() {
  const worker = new Worker(
    'sync-queue',
    async (job) => {
      const { connectionId } = job.data as { connectionId: string };
      await syncConnection(connectionId);
    },
    { connection: getConnection() }
  );

  worker.on('error', (err) => console.error('[ingestion] worker error:', err.message));

  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'ingestion-engine' }));

  app.post('/v1/sync/:connectionId', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    await syncQueue.add('sync', { connectionId }, { removeOnComplete: true });
    return reply.code(202).send({ queued: true });
  });

  app.post('/v1/webhooks/gmail', async (request, reply) => {
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

  app.post('/v1/webhooks/whatsapp', async (request, reply) => {
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

  app.post('/v1/files/index', async (request, reply) => {
    const body = request.body as { userId: string; fileAssetId: string };
    await syncQueue.add('index-file', body, { removeOnComplete: true });
    return reply.code(202).send({ queued: true });
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[ingestion-engine] listening on ${PORT}`);
}

main().catch(console.error);
