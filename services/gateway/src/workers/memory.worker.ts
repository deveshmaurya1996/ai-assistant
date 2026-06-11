import { Queue, Worker } from 'bullmq';
import { config } from '@ai-assistant/config';

export const MEMORY_QUEUE_NAME = 'memory-queue';

let memoryQueue: Queue | null = null;
let memoryWorker: Worker | null = null;

function getConnection() {
  return { url: config.redisUrl };
}

export function getMemoryQueue(): Queue | null {
  return memoryQueue;
}

export async function enqueueMemoryJob(
  name: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!memoryQueue) {
    throw new Error('Memory queue not initialized');
  }
  await memoryQueue.add(name, data, { removeOnComplete: true });
}

export function startMemoryWorker(): Worker | null {
  try {
    memoryQueue = new Queue(MEMORY_QUEUE_NAME, { connection: getConnection() });

    memoryWorker = new Worker(
      MEMORY_QUEUE_NAME,
      async (job) => {
        console.info('[memory-queue] job received', job.name, job.id);
      },
      {
        connection: getConnection(),
        concurrency: config.memoryConcurrency,
      }
    );

    memoryWorker.on('error', (err) => {
      console.error('[memory-queue] worker error:', err.message);
    });

    return memoryWorker;
  } catch (err) {
    console.warn('[memory-queue] worker not started:', err);
    return null;
  }
}

export async function closeMemoryWorker(): Promise<void> {
  await memoryWorker?.close();
  await memoryQueue?.close();
  memoryWorker = null;
  memoryQueue = null;
}
