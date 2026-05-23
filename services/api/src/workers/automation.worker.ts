import { Queue, Worker } from 'bullmq';
import { prisma, Prisma } from '@ai-assistant/database';
import { config } from '@ai-assistant/config';

let automationQueue: Queue | null = null;
let automationWorker: Worker | null = null;
let queueReady = false;

function getConnection() {
  return { url: config.redisUrl };
}

export function isAutomationQueueReady(): boolean {
  return queueReady;
}

export async function scheduleAutomation(
  automationId: string,
  cron?: string,
  immediate = false
) {
  if (!automationQueue) {
    throw new Error('Automation queue not initialized');
  }

  await automationQueue.add(
    'run',
    { automationId },
    {
      jobId: immediate ? `${automationId}-${Date.now()}` : automationId,
      repeat: cron ? { pattern: cron } : undefined,
      removeOnComplete: true,
    }
  );
}

export function startAutomationWorker(): Worker | null {
  try {
    automationQueue = new Queue('automations', { connection: getConnection() });
    queueReady = true;

    automationWorker = new Worker(
      'automations',
      async (job) => {
        const { automationId } = job.data as { automationId: string };
        const automation = await prisma.automation.findUnique({
          where: { id: automationId },
        });
        if (!automation?.isActive) return;

        const run = await prisma.automationRun.create({
          data: { automationId, status: 'RUNNING' },
        });

        try {
          const result = {
            executed: automation.action,
            at: new Date().toISOString(),
          };
          await prisma.automationRun.update({
            where: { id: run.id },
            data: {
              status: 'COMPLETED',
              result: result as Prisma.InputJsonValue,
              completedAt: new Date(),
            },
          });
        } catch (err) {
          await prisma.automationRun.update({
            where: { id: run.id },
            data: {
              status: 'FAILED',
              result: {
                error: err instanceof Error ? err.message : 'Unknown error',
              } as Prisma.InputJsonValue,
              completedAt: new Date(),
            },
          });
        }
      },
      { connection: getConnection() }
    );

    automationWorker.on('error', (err) => {
      console.error('[automation-worker] error:', err.message);
    });

    console.log('[automation-worker] started');
    return automationWorker;
  } catch (err) {
    queueReady = false;
    console.warn(
      '[automation-worker] disabled:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function stopAutomationWorker() {
  await automationWorker?.close();
  await automationQueue?.close();
  automationWorker = null;
  automationQueue = null;
  queueReady = false;
}
