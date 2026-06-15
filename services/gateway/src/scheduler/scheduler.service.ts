import { Queue, Worker } from 'bullmq';
import { prisma } from '@ai-assistant/database';
import { config } from '@ai-assistant/config';
import { createBullMqWorkerConnection, getBullMqQueueConnection } from '../lib/bullmq-redis';
import { fireAutomation } from './automation.handler';
import { fireReminder } from './reminder.handler';
import { nextFireFromCron } from './cron-utils';
import type {
  ScheduleCronJobInput,
  ScheduleJobInput,
  ScheduledJobPayload,
} from './types';

const QUEUE_NAME = 'scheduled-jobs';

let jobQueue: Queue | null = null;
let jobWorker: Worker | null = null;
let queueReady = false;

function jobId(kind: string, entityId: string): string {
  return `${kind}-${entityId}`;
}

export function isSchedulerReady(): boolean {
  return queueReady;
}

export async function scheduleJob(input: ScheduleJobInput): Promise<void> {
  if (!jobQueue) throw new Error('Scheduler queue not initialized');
  const delay = Math.max(0, input.fireAt.getTime() - Date.now());
  const id = jobId(input.kind, input.entityId);
  await jobQueue.add(
    'fire',
    { kind: input.kind, entityId: input.entityId } satisfies ScheduledJobPayload,
    { delay, jobId: id, removeOnComplete: true }
  );
}

export async function scheduleCronJob(input: ScheduleCronJobInput): Promise<void> {
  if (!jobQueue) throw new Error('Scheduler queue not initialized');
  const id = jobId(input.kind, input.entityId);
  await jobQueue.add(
    'fire',
    { kind: input.kind, entityId: input.entityId } satisfies ScheduledJobPayload,
    {
      jobId: id,
      repeat: { pattern: input.cron, tz: input.timezone },
      removeOnComplete: true,
    }
  );
}

export async function unscheduleJob(
  kind: ScheduledJobPayload['kind'],
  entityId: string
): Promise<void> {
  if (!jobQueue) return;
  const id = jobId(kind, entityId);
  try {
    const job = await jobQueue.getJob(id);
    if (job) await job.remove();
  } catch {
    // job may not exist
  }
}

export async function rehydrateAll(): Promise<void> {
  const reminders = await prisma.reminder.findMany({
    where: {
      deletedAt: null,
      status: 'PENDING',
    },
    orderBy: { nextFireAt: 'asc' },
  });

  for (const reminder of reminders) {
    await unscheduleJob('reminder', reminder.id);
    const now = new Date();
    if (reminder.nextFireAt <= now) {
      await fireReminder(reminder.id, { missed: true });
      continue;
    }
    if (reminder.recurrence !== 'NONE' && reminder.cronExpression) {
      const next = nextFireFromCron(
        reminder.cronExpression,
        reminder.timezone,
        now
      );
      if (next.getTime() !== reminder.nextFireAt.getTime()) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { nextFireAt: next },
        });
      }
      await scheduleCronJob({
        kind: 'reminder',
        entityId: reminder.id,
        cron: reminder.cronExpression,
        timezone: reminder.timezone,
      });
    } else {
      await scheduleJob({
        kind: 'reminder',
        entityId: reminder.id,
        fireAt: reminder.nextFireAt,
      });
    }
  }

  const automations = await prisma.automation.findMany({
    where: { isActive: true, schedule: { not: null } },
  });

  for (const automation of automations) {
    if (!automation.schedule) continue;
    await unscheduleJob('automation', automation.id);
    const action = automation.action as { timezone?: string } | null;
    const timezone =
      typeof action?.timezone === 'string' && action.timezone.trim()
        ? action.timezone.trim()
        : undefined;
    await scheduleCronJob({
      kind: 'automation',
      entityId: automation.id,
      cron: automation.schedule,
      timezone,
    });
  }

  console.log(
    `[scheduler] rehydrated ${reminders.length} reminders, ${automations.length} automations`
  );
}

export function startScheduler(): Worker | null {
  try {
    jobQueue = new Queue(QUEUE_NAME, { connection: getBullMqQueueConnection() });
    queueReady = true;

    jobWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const data = job.data as ScheduledJobPayload;
        if (data.kind === 'reminder') {
          await fireReminder(data.entityId, { missed: data.missed });
        } else if (data.kind === 'automation') {
          await fireAutomation(data.entityId);
        }
      },
      {
        connection: createBullMqWorkerConnection(),
        concurrency: config.schedulerConcurrency,
      }
    );

    jobWorker.on('error', (err) => {
      console.error('[scheduler] worker error:', err.message);
    });

    void rehydrateAll().catch((err) => {
      console.warn('[scheduler] rehydrate failed:', err);
    });

    console.log('[scheduler] started');
    return jobWorker;
  } catch (err) {
    queueReady = false;
    console.warn('[scheduler] disabled:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function closeScheduler(): Promise<void> {
  return stopScheduler();
}

export async function stopScheduler(): Promise<void> {
  await jobWorker?.close();
  await jobQueue?.close();
  jobWorker = null;
  jobQueue = null;
  queueReady = false;
}
