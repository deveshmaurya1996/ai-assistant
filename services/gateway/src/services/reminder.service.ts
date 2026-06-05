import { prisma, Prisma, type ReminderRecurrence, type ReminderStatus } from '@ai-assistant/database';
import { badRequest, notFound } from '../lib/errors';
import {
  scheduleCronJob,
  scheduleJob,
  unscheduleJob,
  isSchedulerReady,
} from '../scheduler';
import { humanizeCron } from '../scheduler';
import { validateStructuredReminderSchedule } from './schedule-validator.service';
import { normalizeClientTimezone } from './normalize-client-timezone';
import { nextFireFromCron } from '../scheduler/cron-utils';

export type CreateReminderParams = {
  title: string;
  body?: string;
  userPrompt?: string;
  recurrence?: ReminderRecurrence;
  cronExpression?: string;
  timezone?: string;
  nextFireAt?: string;
};

export type UpdateReminderParams = {
  title?: string;
  body?: string;
  userPrompt?: string;
  recurrence?: ReminderRecurrence;
  cronExpression?: string | null;
  timezone?: string;
  nextFireAt?: string;
  status?: ReminderStatus;
};

export type ReminderScheduleResult = {
  scheduled: boolean;
  scheduleWarning?: string;
};

function serializeReminder(r: {
  id: string;
  userId: string;
  payload: unknown;
  userPrompt: string | null;
  recurrence: ReminderRecurrence;
  cronExpression: string | null;
  timezone: string;
  nextFireAt: Date;
  lastFiredAt: Date | null;
  status: ReminderStatus;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...r,
    payload: r.payload as Record<string, unknown>,
    nextFireAt: r.nextFireAt.toISOString(),
    lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function getReminder(userId: string, id: string) {
  const reminder = await prisma.reminder.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!reminder) throw notFound('Reminder not found');
  return serializeReminder(reminder);
}

export async function listReminders(userId: string) {
  return listRemindersForUser(userId, { status: 'ALL' });
}

function formatCountdownLabel(nextFireAt: Date): string {
  const diffMs = nextFireAt.getTime() - Date.now();
  if (diffMs <= 0) return 'now';
  const totalMinutes = Math.round(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export async function listRemindersForUser(
  userId: string,
  options: { status?: 'PENDING' | 'PAUSED' | 'ALL'; title?: string } = {}
) {
  const statusFilter =
    options.status === 'ALL' || !options.status
      ? undefined
      : options.status === 'PAUSED'
        ? (['PAUSED'] as ReminderStatus[])
        : (['PENDING'] as ReminderStatus[]);

  const reminders = await prisma.reminder.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    },
    orderBy: { nextFireAt: 'asc' },
  });

  const titleNeedle = options.title?.trim().toLowerCase();
  const filtered = titleNeedle
    ? reminders.filter((r) => {
        const p = r.payload as { title?: string };
        return p.title?.toLowerCase().includes(titleNeedle);
      })
    : reminders;

  return filtered.map((r) => {
    const serialized = serializeReminder(r);
    return {
      ...serialized,
      countdownLabel: formatCountdownLabel(r.nextFireAt),
    };
  });
}

function resolveReminderTimezone(params: {
  timezone?: string;
  userPrompt?: string;
}): string {
  const clientTz = params.timezone?.trim();
  if (clientTz) return normalizeClientTimezone(clientTz);
  if (params.userPrompt?.trim()) {
    throw badRequest(
      'timezone is required for chat-created reminders — use the device timezone from the client'
    );
  }
  return 'UTC';
}

export async function createReminder(userId: string, params: CreateReminderParams) {
  const userPrompt = params.userPrompt?.trim() || undefined;
  const timezone = resolveReminderTimezone({ timezone: params.timezone, userPrompt });
  const parsed = validateStructuredReminderSchedule(
    {
      ...params,
      title: params.title,
      userPrompt,
      timezone,
    },
    { chatCreated: Boolean(userPrompt) }
  );
  const payload: Record<string, unknown> = {
    title: parsed.title,
    body: parsed.body ?? parsed.title,
  };

  const reminder = await prisma.reminder.create({
    data: {
      userId,
      payload: payload as Prisma.InputJsonValue,
      userPrompt: userPrompt ?? parsed.userPrompt ?? null,
      recurrence: parsed.recurrence,
      cronExpression: parsed.cronExpression,
      timezone: parsed.timezone,
      nextFireAt: parsed.nextFireAt,
      status: 'PENDING',
    },
  });

  const scheduleResult = await queueReminderJob(reminder);
  const serialized = serializeReminder(reminder);
  const scheduleLabel =
    serialized.cronExpression && serialized.recurrence !== 'NONE'
      ? humanizeCron(serialized.cronExpression, serialized.timezone)
      : null;
  return { ...serialized, ...scheduleResult, scheduleLabel };
}

export async function updateReminder(
  userId: string,
  id: string,
  params: UpdateReminderParams
) {
  const existing = await prisma.reminder.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!existing) throw notFound('Reminder not found');

  const payload = { ...(existing.payload as Record<string, unknown>) };
  if (params.title !== undefined) payload.title = params.title;
  if (params.body !== undefined) payload.body = params.body;

  let recurrence = params.recurrence ?? existing.recurrence;
  let cronExpression =
    params.cronExpression !== undefined
      ? params.cronExpression
      : existing.cronExpression;
  const timezone = params.timezone?.trim()
    ? normalizeClientTimezone(params.timezone.trim())
    : existing.timezone;
  let nextFireAt = params.nextFireAt
    ? new Date(params.nextFireAt)
    : existing.nextFireAt;
  const status = params.status ?? existing.status;

  if (params.recurrence || params.cronExpression || params.nextFireAt || params.timezone) {
    const parsed = validateStructuredReminderSchedule(
      {
        title: String(payload.title ?? 'Reminder'),
        body: payload.body as string | undefined,
        userPrompt: params.userPrompt ?? existing.userPrompt ?? undefined,
        recurrence,
        cronExpression: cronExpression ?? undefined,
        timezone,
        nextFireAt: nextFireAt.toISOString(),
      },
      { chatCreated: false }
    );
    recurrence = parsed.recurrence;
    cronExpression = parsed.cronExpression;
    nextFireAt = parsed.nextFireAt;
  }

  if (status === 'PENDING' && recurrence !== 'NONE' && cronExpression) {
    nextFireAt = nextFireFromCron(cronExpression, timezone);
  }

  const updated = await prisma.reminder.update({
    where: { id },
    data: {
      payload: payload as Prisma.InputJsonValue,
      userPrompt: params.userPrompt ?? existing.userPrompt,
      recurrence,
      cronExpression,
      timezone,
      nextFireAt,
      status,
    },
  });

  await unscheduleJob('reminder', id);
  if (status === 'PENDING') {
    await queueReminderJob(updated);
  }

  return serializeReminder(updated);
}

export async function softDeleteReminder(userId: string, id: string) {
  const existing = await prisma.reminder.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!existing) throw notFound('Reminder not found');

  await unscheduleJob('reminder', id);
  await prisma.reminder.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  });
}

export async function cancelReminder(userId: string, id: string) {
  return softDeleteReminder(userId, id);
}

export async function findReminderByTitle(userId: string, title: string) {
  const reminders = await prisma.reminder.findMany({
    where: {
      userId,
      deletedAt: null,
      status: { in: ['PENDING', 'PAUSED'] },
    },
  });
  const lower = title.toLowerCase();
  return (
    reminders.find((r) => {
      const p = r.payload as { title?: string };
      return p.title?.toLowerCase().includes(lower);
    }) ?? null
  );
}

async function queueReminderJob(reminder: {
  id: string;
  recurrence: ReminderRecurrence;
  cronExpression: string | null;
  timezone: string;
  nextFireAt: Date;
}): Promise<ReminderScheduleResult> {
  if (!isSchedulerReady()) {
    const scheduleWarning =
      'Scheduler unavailable — reminder saved but notification may be delayed until service restarts.';
    console.warn('[reminder]', scheduleWarning);
    return { scheduled: false, scheduleWarning };
  }
  try {
    await scheduleReminderJob(reminder);
    return { scheduled: true };
  } catch (err) {
    const scheduleWarning =
      err instanceof Error
        ? `Reminder saved but scheduling failed: ${err.message}`
        : 'Reminder saved but scheduling failed.';
    console.warn('[reminder]', scheduleWarning);
    return { scheduled: false, scheduleWarning };
  }
}

async function scheduleReminderJob(reminder: {
  id: string;
  recurrence: ReminderRecurrence;
  cronExpression: string | null;
  timezone: string;
  nextFireAt: Date;
}) {
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
