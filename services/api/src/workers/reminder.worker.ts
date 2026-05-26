import { Queue, Worker } from 'bullmq';
import { config } from '@ai-assistant/config';
import { prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { toolRuntimeFetch } from '../lib/runtime-clients';

let reminderQueue: Queue | null = null;
let reminderWorker: Worker | null = null;

function getConnection() {
  return { url: config.redisUrl };
}

export async function scheduleReminder(reminderId: string, fireAt: Date) {
  if (!reminderQueue) throw new Error('Reminder queue not initialized');
  const delay = Math.max(0, fireAt.getTime() - Date.now());
  await reminderQueue.add('fire', { reminderId }, { delay, jobId: reminderId, removeOnComplete: true });
}

export function startReminderWorker(): Worker | null {
  try {
    reminderQueue = new Queue('reminder-queue', { connection: getConnection() });
    reminderWorker = new Worker(
      'reminder-queue',
      async (job) => {
        const { reminderId } = job.data as { reminderId: string };
        const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
        if (!reminder || reminder.status !== 'PENDING') return;

        const payload = reminder.payload as Record<string, unknown>;
        const action = payload.action as { tool?: string; args?: Record<string, unknown> } | undefined;

        if (action?.tool) {
          await toolRuntimeFetch('/v1/executions', {
            method: 'POST',
            body: JSON.stringify({
              userId: reminder.userId,
              tool: action.tool,
              args: action.args ?? {},
              source: 'automation',
              confirmed: true,
            }),
          });
        }

        await prisma.reminder.update({
          where: { id: reminderId },
          data: { status: 'FIRED' },
        });

        await publishEvent(EventNames.NOTIFICATION_CREATED, {
          userId: reminder.userId,
          title: String(payload.title ?? 'Reminder'),
          body: String(payload.body ?? ''),
          type: 'reminder',
        });
      },
      { connection: getConnection() }
    );
    console.log('[reminder-worker] started');
    return reminderWorker;
  } catch (err) {
    console.warn('[reminder-worker] disabled:', err);
    return null;
  }
}
