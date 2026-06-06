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

const MIN_LEAD_SECONDS = 15;

const RELATIVE_ONE_MINUTE_RE = /\b(?:in|after)\s+(?:a|one)\s+min(?:ute)?\b/i;
const RELATIVE_MINUTES_RE = /\b(?:in|after)\s+(\d+)\s*(?:min(?:ute)?s?)\b/i;

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

export function parseRelativeMinutesFromPrompt(text: string | undefined): number | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;
  if (RELATIVE_ONE_MINUTE_RE.test(raw)) return 1;
  const match = RELATIVE_MINUTES_RE.exec(raw);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function isoHasExplicitOffset(iso: string): boolean {
  return /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso.trim());
}

function parseNextFireAt(iso: string, timezone: string): Date {
  const trimmed = iso.trim();
  let parsed = isoHasExplicitOffset(trimmed)
    ? DateTime.fromISO(trimmed, { setZone: true }).setZone(timezone)
    : DateTime.fromISO(trimmed, { zone: timezone });
  if (!parsed.isValid) {
    throw badRequest(`nextFireAt is not a valid ISO datetime: ${iso}`);
  }
  if (!parsed.isValid) {
    throw badRequest(`nextFireAt could not be interpreted in timezone ${timezone}`);
  }
  return parsed.toJSDate();
}

function stabilizeOneShotNextFireAt(
  nextFireAt: Date,
  timezone: string,
  userPrompt: string | undefined
): Date {
  const now = DateTime.now().setZone(timezone);
  let fire = DateTime.fromJSDate(nextFireAt, { zone: timezone });

  if (fire <= now) {
    const relativeMin = parseRelativeMinutesFromPrompt(userPrompt);
    if (relativeMin != null) {
      return now.plus({ minutes: relativeMin }).toJSDate();
    }
    if (fire > now.minus({ minutes: 5 })) {
      return now.plus({ seconds: MIN_LEAD_SECONDS }).toJSDate();
    }
    throw badRequest('nextFireAt must be in the future');
  }

  const leadSeconds = fire.diff(now, 'seconds').seconds;
  if (leadSeconds < MIN_LEAD_SECONDS) {
    fire = now.plus({ seconds: MIN_LEAD_SECONDS });
    return fire.toJSDate();
  }

  return nextFireAt;
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
    nextFireAt = stabilizeOneShotNextFireAt(nextFireAt, timezone, userPrompt);
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
