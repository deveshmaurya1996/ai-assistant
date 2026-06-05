import { prisma, Prisma } from '@ai-assistant/database';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { toolRuntimeFetch } from '../lib/runtime-clients';
import { sendPushToUser } from '../services/push-notification.service';
import { nextFireFromCron } from './cron-utils';
import { scheduleCronJob, scheduleJob } from './scheduler.service';

export async function fireReminder(
  reminderId: string,
  options: { missed?: boolean } = {}
): Promise<void> {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder || reminder.deletedAt || reminder.status === 'PAUSED') return;
  if (reminder.status !== 'PENDING') return;

  const payload = reminder.payload as Record<string, unknown>;
  const action = payload.action as
    | { tool?: string; args?: Record<string, unknown> }
    | undefined;

  if (action?.tool) {
    try {
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
    } catch (err) {
      await prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'FAILED' },
      });
      console.warn('[reminder] action failed:', err);
      return;
    }
  }

  const title = String(payload.title ?? 'Reminder');
  let body = String(payload.body ?? payload.title ?? '');
  if (options.missed) {
    body = body ? `Sorry this is late — ${body}` : 'Sorry this is late — your reminder is due now.';
  }

  const now = new Date();

  if (reminder.recurrence === 'NONE') {
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: 'FIRED', lastFiredAt: now },
    });
  } else if (reminder.cronExpression) {
    const nextFireAt = nextFireFromCron(
      reminder.cronExpression,
      reminder.timezone,
      now
    );
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { lastFiredAt: now, nextFireAt },
    });
  } else {
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: 'FIRED', lastFiredAt: now },
    });
  }

  await publishEvent(EventNames.NOTIFICATION_CREATED, {
    userId: reminder.userId,
    title,
    body,
    type: 'reminder',
    reminderId: reminderId,
    missed: options.missed === true,
  });

  await sendPushToUser({
    userId: reminder.userId,
    title,
    body,
    data: {
      type: 'reminder',
      reminderId,
      missed: options.missed === true,
    },
  });
}

export async function rescheduleReminderRecord(
  reminder: {
    id: string;
    recurrence: string;
    cronExpression: string | null;
    timezone: string;
    nextFireAt: Date;
    status: string;
  }
): Promise<void> {
  if (reminder.status === 'PAUSED' || reminder.status !== 'PENDING') return;

  if (reminder.recurrence !== 'NONE' && reminder.cronExpression) {
    await scheduleCronJob({
      kind: 'reminder',
      entityId: reminder.id,
      cron: reminder.cronExpression,
      timezone: reminder.timezone,
    });
    return;
  }

  await scheduleJob({
    kind: 'reminder',
    entityId: reminder.id,
    fireAt: reminder.nextFireAt,
  });
}
