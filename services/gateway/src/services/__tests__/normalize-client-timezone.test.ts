import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { normalizeClientTimezone } from '../normalize-client-timezone.js';
import { validateCronExpression } from '../../scheduler/cron-utils.js';

describe('normalizeClientTimezone', () => {
  it('passes through valid IANA zones', () => {
    assert.equal(normalizeClientTimezone('Asia/Kolkata'), 'Asia/Kolkata');
  });

  it('normalizes UTC offset to fixed offset for cron', () => {
    const normalized = normalizeClientTimezone('UTC+5:30');
    assert.equal(normalized, '+05:30');
    assert.equal(DateTime.now().setZone(normalized).isValid, true);
    assert.equal(validateCronExpression('* * * * *', normalized), true);
  });
});
