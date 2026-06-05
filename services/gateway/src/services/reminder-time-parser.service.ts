import type { ReminderRecurrence } from '@ai-assistant/database';
import { DateTime } from 'luxon';
import {
  compilePresetCron,
  nextFireFromCron,
  validateCronExpression,
} from '../scheduler/cron-utils';

export type ParsedReminderSchedule = {
  title: string;
  body?: string;
  userPrompt?: string;
  recurrence: ReminderRecurrence;
  cronExpression: string | null;
  timezone: string;
  nextFireAt: Date;
};

const EVERY_MINUTE = /\bevery\s+(?:(\d+)\s*)?min(?:ute)?s?\b/i;
const EVERY_N_HOURS = /\bevery\s+(?:(\d+)\s+)?hours?\b/i;
const EVERY_HOUR = /\bevery\s+hour\b/i;
const EVERY_DAY = /\bevery\s+(day|morning|evening|night)\b/i;
const EVERY_WEEKDAY = /\bevery\s+weekday\b/i;
const EVERY_WEEK = /\bevery\s+week\b/i;
const IN_HOURS = /\bin\s+(\d+)\s+hours?\b/i;
const AT_TIME = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
const TOMORROW = /\btomorrow\b/i;
const TOMORROW_MORNING = /\btomorrow\s+morning\b/i;

export function parseReminderSchedule(
  input: {
    title: string;
    body?: string;
    userPrompt?: string;
    nextFireAt?: string;
    recurrence?: ReminderRecurrence;
    cronExpression?: string;
    timezone?: string;
  },
  fallbackTimezone = 'UTC'
): ParsedReminderSchedule {
  const timezone = input.timezone ?? fallbackTimezone;
  const userPrompt = input.userPrompt?.trim() || input.title;
  const text = `${userPrompt} ${input.title}`.toLowerCase();

  let recurrence = input.recurrence ?? 'NONE';
  let cronExpression = input.cronExpression ?? null;
  let nextFireAt: Date;

  if (input.nextFireAt) {
    nextFireAt = new Date(input.nextFireAt);
  } else {
    nextFireAt = inferNextFireAt(text, timezone);
  }

  if (!input.cronExpression && !input.recurrence) {
    const everyMin = text.match(EVERY_MINUTE);
    if (everyMin) {
      const n = everyMin[1] ? Math.max(1, parseInt(everyMin[1], 10)) : 1;
      recurrence = 'CUSTOM';
      cronExpression = n === 1 ? '* * * * *' : `*/${n} * * * *`;
    } else if (EVERY_WEEKDAY.test(text)) {
      recurrence = 'CUSTOM';
      const local = DateTime.fromJSDate(nextFireAt, { zone: timezone });
      cronExpression = `${local.minute} ${local.hour} * * 1-5`;
    } else if (EVERY_N_HOURS.test(text)) {
      const everyHours = text.match(EVERY_N_HOURS);
      const n = everyHours?.[1] ? Math.max(1, parseInt(everyHours[1], 10)) : 1;
      if (n === 1) {
        recurrence = 'HOURLY';
        cronExpression = compilePresetCron('HOURLY', nextFireAt, timezone);
      } else {
        recurrence = 'CUSTOM';
        cronExpression = `0 */${n} * * *`;
      }
    } else if (EVERY_HOUR.test(text)) {
      recurrence = 'HOURLY';
      cronExpression = compilePresetCron('HOURLY', nextFireAt, timezone);
    } else if (EVERY_DAY.test(text)) {
      recurrence = 'DAILY';
      cronExpression = compilePresetCron('DAILY', nextFireAt, timezone);
    } else if (EVERY_WEEK.test(text)) {
      recurrence = 'WEEKLY';
      cronExpression = compilePresetCron('WEEKLY', nextFireAt, timezone);
    }
  }

  if (recurrence !== 'NONE' && recurrence !== 'CUSTOM' && !cronExpression) {
    cronExpression = compilePresetCron(recurrence, nextFireAt, timezone);
  }

  if (cronExpression) {
    if (!validateCronExpression(cronExpression, timezone)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
    if (recurrence === 'NONE') recurrence = 'CUSTOM';
    nextFireAt = nextFireFromCron(cronExpression, timezone);
  }

  return {
    title: input.title,
    body: input.body,
    userPrompt,
    recurrence,
    cronExpression,
    timezone,
    nextFireAt,
  };
}

function inferNextFireAt(text: string, timezone: string): Date {
  const now = DateTime.now().setZone(timezone);

  const everyMin = text.match(EVERY_MINUTE);
  if (everyMin) {
    const n = everyMin[1] ? Math.max(1, parseInt(everyMin[1], 10)) : 1;
    return now.plus({ minutes: n }).toJSDate();
  }

  const everyHours = text.match(EVERY_N_HOURS);
  if (everyHours) {
    const n = everyHours[1] ? Math.max(1, parseInt(everyHours[1], 10)) : 1;
    return now.plus({ hours: n }).toJSDate();
  }

  const inHours = text.match(IN_HOURS);
  if (inHours) {
    return now.plus({ hours: parseInt(inHours[1], 10) }).toJSDate();
  }

  if (TOMORROW_MORNING.test(text)) {
    return now.plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 }).toJSDate();
  }

  if (TOMORROW.test(text)) {
    const at = text.match(AT_TIME);
    if (at) {
      const hour = parseHour(at[1], at[3]);
      const minute = at[2] ? parseInt(at[2], 10) : 0;
      return now
        .plus({ days: 1 })
        .set({ hour, minute, second: 0, millisecond: 0 })
        .toJSDate();
    }
    return now.plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toJSDate();
  }

  const at = text.match(AT_TIME);
  if (at) {
    let hour = parseHour(at[1], at[3]);
    const minute = at[2] ? parseInt(at[2], 10) : 0;
    let candidate = now.set({ hour, minute, second: 0, millisecond: 0 });
    if (candidate <= now) candidate = candidate.plus({ days: 1 });
    return candidate.toJSDate();
  }

  if (/\bmorning\b/i.test(text)) {
    let candidate = now.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    if (candidate <= now) candidate = candidate.plus({ days: 1 });
    return candidate.toJSDate();
  }

  return now.plus({ hours: 1 }).toJSDate();
}

function parseHour(hourStr: string, ampm?: string): number {
  let hour = parseInt(hourStr, 10);
  if (ampm?.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (ampm?.toLowerCase() === 'am' && hour === 12) hour = 0;
  return hour;
}
