import { DateTime } from 'luxon';

const TIMEZONE_ALIASES: Record<string, string> = {
  ist: 'Asia/Kolkata',
  india: 'Asia/Kolkata',
  'india standard time': 'Asia/Kolkata',
  'indian standard time': 'Asia/Kolkata',
  pst: 'America/Los_Angeles',
  pdt: 'America/Los_Angeles',
  pacific: 'America/Los_Angeles',
  est: 'America/New_York',
  edt: 'America/New_York',
  eastern: 'America/New_York',
  cst: 'America/Chicago',
  cdt: 'America/Chicago',
  central: 'America/Chicago',
  mst: 'America/Denver',
  mdt: 'America/Denver',
  mountain: 'America/Denver',
  gmt: 'Europe/London',
  bst: 'Europe/London',
  utc: 'UTC',
  cet: 'Europe/Paris',
  aest: 'Australia/Sydney',
  aedt: 'Australia/Sydney',
  jst: 'Asia/Tokyo',
  kst: 'Asia/Seoul',
  sgt: 'Asia/Singapore',
  hkt: 'Asia/Hong_Kong',
  dubai: 'Asia/Dubai',
  uae: 'Asia/Dubai',
};

export function normalizeClientTimezone(tz: string): string {
  const trimmed = tz.trim();
  if (!trimmed) return trimmed;

  const alias = TIMEZONE_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  const offset = trimmed.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/i);
  if (offset) {
    const sign = offset[1];
    const hours = offset[2].padStart(2, '0');
    const minutes = (offset[3] ?? '00').padStart(2, '0');
    const ianaOffset = `${sign}${hours}:${minutes}`;
    if (DateTime.now().setZone(ianaOffset).isValid) {
      return ianaOffset;
    }
  }

  if (DateTime.now().setZone(trimmed).isValid) {
    return trimmed;
  }

  return trimmed;
}
