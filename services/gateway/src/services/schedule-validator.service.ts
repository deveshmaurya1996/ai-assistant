import type { ReminderRecurrence } from '@ai-assistant/database';
import { DateTime } from 'luxon';
import { badRequest } from '../lib/errors';
import { nextFireFromCron, validateCronExpression } from '../scheduler/cron-utils';
import { deriveReminderDisplayTitle } from './reminder-title.service';
import { normalizeClientTimezone } from './normalize-client-timezone';

export type ScheduleInput = {
  title: string;
  body?: string;
  userPrompt?: string;
  nextFireAt?: string;
  recurrence?: ReminderRecurrence;
  cronExpression?: string | null;
  timezone?: string;
};

export type ValidatedSchedule = {
  title: string;
  body?: string;
  userPrompt?: string;
  recurrence: ReminderRecurrence;
  cronExpression: string | null;
  timezone: string;
  nextFireAt: Date;
};

const AUTOMATION_TASK_PATTERN =
  /\b(inbox|digest|check\s+my|monitor|summarize\s+my|scan\s+my|automation)\b/i;

function assertNotAutomationTaskLanguage(
  userPrompt: string | undefined,
  title: string,
  chatCreated: boolean
): void {
  if (!chatCreated) return;
  const combined = `${userPrompt ?? ''} ${title}`.trim();
  if (AUTOMATION_TASK_PATTERN.test(combined)) {
    throw badRequest(
      'This request looks like a recurring automation task (inbox/digest/monitor). ' +
        'Use automation.create instead of reminder.create.'
    );
  }
}

function parseNextFireAt(iso: string, timezone: string): Date {
  const parsed = DateTime.fromISO(iso, { setZone: true });
  if (!parsed.isValid) {
    throw badRequest(`nextFireAt is not a valid ISO datetime: ${iso}`);
  }
  const inTz = parsed.setZone(timezone);
  if (!inTz.isValid) {
    throw badRequest(`nextFireAt could not be interpreted in timezone ${timezone}`);
  }
  return inTz.toJSDate();
}

export function validateStructuredReminderSchedule(
  input: ScheduleInput,
  options: { chatCreated: boolean }
): ValidatedSchedule {
  const userPrompt = input.userPrompt?.trim() || undefined;
  const rawTz = input.timezone?.trim();
  if (!rawTz) {
    if (options.chatCreated) {
      throw badRequest(
        'timezone is required for chat-created reminders — use the device timezone from the client'
      );
    }
  }
  const timezone = rawTz ? normalizeClientTimezone(rawTz) : 'UTC';

  if (options.chatCreated && !input.nextFireAt?.trim()) {
    throw badRequest(
      'nextFireAt is required for chat-created reminders — the planner must supply structured schedule fields'
    );
  }

  if (!input.nextFireAt?.trim()) {
    throw badRequest('nextFireAt is required');
  }

  const displayTitle = deriveReminderDisplayTitle(userPrompt ?? input.title, input.title);
  assertNotAutomationTaskLanguage(userPrompt, displayTitle, options.chatCreated);
  let recurrence = input.recurrence ?? 'NONE';
  let cronExpression = input.cronExpression ?? null;

  if (options.chatCreated && recurrence !== 'NONE' && !cronExpression) {
    throw badRequest('cronExpression is required for recurring chat-created reminders');
  }

  if (cronExpression) {
    if (!validateCronExpression(cronExpression, timezone)) {
      throw badRequest(`Invalid cron expression: ${cronExpression}`);
    }
    if (recurrence === 'NONE') {
      recurrence = 'CUSTOM';
    }
  }

  let nextFireAt = parseNextFireAt(input.nextFireAt.trim(), timezone);

  if (recurrence !== 'NONE' && cronExpression) {
    nextFireAt = nextFireFromCron(cronExpression, timezone);
  } else {
    const now = DateTime.now().setZone(timezone);
    const fire = DateTime.fromJSDate(nextFireAt, { zone: timezone });
    if (fire < now.minus({ minutes: 1 })) {
      throw badRequest('nextFireAt must be in the future');
    }
  }

  return {
    title: displayTitle,
    body: input.body,
    userPrompt,
    recurrence,
    cronExpression,
    timezone,
    nextFireAt,
  };
}
