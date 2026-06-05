import { DateTime } from 'luxon';

export function normalizeClientTimezone(tz: string): string {
  const trimmed = tz.trim();
  if (!trimmed) return trimmed;

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
