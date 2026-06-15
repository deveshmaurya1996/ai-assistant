import { Queue, Worker } from 'bullmq';
import { createDecipheriv, scryptSync } from 'node:crypto';
import { config } from '@ai-assistant/config';
import { prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { getConnector } from '@ai-assistant/integration-runtime';
import { createBullMqWorkerConnection, getBullMqQueueConnection } from '../lib/bullmq-redis';
import { processFileAsset } from '../jobs/process-file';

export const INGESTION_QUEUE_NAME = 'ingestion-queue';
export const LEGACY_SYNC_QUEUE_NAME = 'sync-queue';

let ingestionQueue: Queue | null = null;
let ingestionWorker: Worker | null = null;

function decryptCredentials(ciphertext: string): string {
  const ALGORITHM = 'aes-256-gcm';
  const IV_LENGTH = 16;
  const TAG_LENGTH = 16;
  const secret = config.integrationEncryptionKey;
  const key = scryptSync(secret, 'ai-assistant-salt', 32);
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

async function syncConnection(connectionId: string): Promise<void> {
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

export function getIngestionQueue(): Queue | null {
  return ingestionQueue;
}

export async function enqueueIngestionJob(
  name: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!ingestionQueue) {
    throw new Error('Ingestion queue not initialized');
  }
  await ingestionQueue.add(name, data, { removeOnComplete: true });
}

export function startIngestionWorker(): Worker | null {
  try {
    ingestionQueue = new Queue(INGESTION_QUEUE_NAME, { connection: getBullMqQueueConnection() });

    ingestionWorker = new Worker(
      INGESTION_QUEUE_NAME,
      async (job) => {
        if (job.name === 'index-file') {
          const { userId, fileAssetId } = job.data as {
            userId: string;
            fileAssetId: string;
          };
          await processFileAsset(userId, fileAssetId);
          return;
        }
        const { connectionId } = job.data as { connectionId: string };
        await syncConnection(connectionId);
      },
      {
        connection: createBullMqWorkerConnection(),
        concurrency: config.ingestionConcurrency,
        limiter: { max: 5, duration: 1000 },
      }
    );

    ingestionWorker.on('error', (err) => {
      console.error('[ingestion] worker error:', err.message);
    });

    return ingestionWorker;
  } catch (err) {
    console.warn('[ingestion] worker not started:', err);
    return null;
  }
}

export async function closeIngestionWorker(): Promise<void> {
  await ingestionWorker?.close();
  await ingestionQueue?.close();
  ingestionWorker = null;
  ingestionQueue = null;
}
