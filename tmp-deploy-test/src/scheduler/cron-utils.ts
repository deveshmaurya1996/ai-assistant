import { CronExpressionParser } from 'cron-parser';
import { DateTime } from 'luxon';
import type { ReminderRecurrence } from '@ai-assistant/database';

const PRESET_CRON: Record<Exclude<ReminderRecurrence, 'NONE' | 'CUSTOM'>, string> = {
  HOURLY: '0 * * * *',
  DAILY: '0 8 * * *',
  WEEKLY: '0 8 * * 1',
  MONTHLY: '0 8 1 * *',
};

export function compilePresetCron(
  recurrence: ReminderRecurrence,
  anchor: Date,
  timezone: string
): string | null {
  if (recurrence === 'NONE' || recurrence === 'CUSTOM') return null;
  const base = PRESET_CRON[recurrence];
  if (recurrence === 'HOURLY') return base;
  const local = DateTime.fromJSDate(anchor, { zone: timezone });
  const minute = local.minute;
  const hour = local.hour;
  if (recurrence === 'DAILY') return `${minute} ${hour} * * *`;
  if (recurrence === 'WEEKLY') {
    const dow = local.weekday % 7;
    return `${minute} ${hour} * * ${dow}`;
  }
  if (recurrence === 'MONTHLY') return `${minute} ${hour} ${local.day} * *`;
  return base;
}

export function validateCronExpression(cron: string, timezone: string): boolean {
  try {
    CronExpressionParser.parse(cron, { tz: timezone });
    return true;
  } catch {
    return false;
  }
}

export function nextFireFromCron(cron: string, timezone: string, after: Date = new Date()): Date {
  const interval = CronExpressionParser.parse(cron, {
    tz: timezone,
    currentDate: after,
  });
  return interval.next().toDate();
}

export function normalizeCronForHumanize(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 6) return cron;

  const [sec, min, hr, dom, mon, dow] = parts;
  const allWildcards = (fields: string[]) => fields.every((f) => f === '*');

  if (sec === '0' && min === '0' && hr.startsWith('*/') && allWildcards([dom, mon, dow])) {
    return `0 ${hr} * * *`;
  }
  if (sec === '0' && min.startsWith('*/') && hr === '*' && allWildcards([dom, mon, dow])) {
    return `${min} * * * *`;
  }

  const secStep = sec.match(/^(?:0|\*)\/(\d+)$/);
  if (secStep && allWildcards([min, hr, dom, mon, dow])) {
    const n = secStep[1];
    return n === '1' ? '0 * * * *' : `0 */${n} * * *`;
  }

  if (sec === '0') {
    return parts.slice(1).join(' ');
  }

  return cron;
}

export function humanizeCron(cron: string, timezone: string): string {
  const normalized = normalizeCronForHumanize(cron);
  const parts = normalized.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [minute, hour, , , dow] = parts;
  if (minute === '*' && hour === '*') return 'Every minute';
  if (hour === '*' && minute.startsWith('*/')) {
    const n = minute.slice(2);
    return n === '1' ? 'Every minute' : `Every ${n} minutes`;
  }
  if (minute === '0' && hour.startsWith('*/')) {
    const n = hour.slice(2);
    return n === '1' ? 'Every hour' : `Every ${n} hours`;
  }
  if (hour === '*' && minute === '0') return 'Every hour';
  if (dow === '1-5') return `Weekdays at ${formatHour(hour, minute, timezone)}`;
  if (dow === '*') return `Daily at ${formatHour(hour, minute, timezone)}`;
  return cron;
}

function formatHour(hour: string, minute: string, timezone: string): string {
  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  if (Number.isNaN(h)) return `${hour}:${minute}`;
  const dt = DateTime.fromObject({ hour: h, minute: m }, { zone: timezone });
  return dt.toFormat('h:mm a');
}
