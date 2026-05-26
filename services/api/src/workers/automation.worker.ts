import { Queue, Worker } from 'bullmq';
import { prisma, Prisma } from '@ai-assistant/database';
import { config } from '@ai-assistant/config';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { toolRuntimeFetch } from '../lib/runtime-clients';

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
    automationQueue = new Queue('automation-queue', { connection: getConnection() });
    queueReady = true;

    automationWorker = new Worker(
      'automation-queue',
      async (job) => {
        const { automationId } = job.data as { automationId: string };
        const automation = await prisma.automation.findUnique({
          where: { id: automationId },
        });
        if (!automation?.isActive) return;

        const run = await prisma.automationRun.create({
          data: { automationId, status: 'RUNNING' },
        });

        await publishEvent(EventNames.AUTOMATION_STARTED, {
          userId: automation.userId,
          automationId,
          runId: run.id,
          status: 'started',
        });

        try {
          const action = automation.action as {
            tool?: string;
            connector?: string;
            args?: Record<string, unknown>;
          };

          let result: unknown = { executed: action, at: new Date().toISOString() };

          if (action.tool) {
            const res = await toolRuntimeFetch('/v1/executions', {
              method: 'POST',
              body: JSON.stringify({
                userId: automation.userId,
                tool: action.tool,
                args: action.args ?? {},
                source: 'automation',
                confirmed: true,
              }),
            });
            result = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(result));
          }

          await prisma.automationRun.update({
            where: { id: run.id },
            data: {
              status: 'COMPLETED',
              result: result as Prisma.InputJsonValue,
              completedAt: new Date(),
            },
          });

          await publishEvent(EventNames.AUTOMATION_COMPLETED, {
            userId: automation.userId,
            automationId,
            runId: run.id,
            status: 'completed',
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

          await publishEvent(EventNames.AUTOMATION_COMPLETED, {
            userId: automation.userId,
            automationId,
            runId: run.id,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
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
