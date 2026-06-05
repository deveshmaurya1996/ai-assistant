import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ReminderScheduleResult } from '../reminder.service.js';

describe('ReminderScheduleResult', () => {
  it('models delayed scheduling for chat confirmations', () => {
    const delayed: ReminderScheduleResult = {
      scheduled: false,
      scheduleWarning:
        'Scheduler unavailable — reminder saved but notification may be delayed until service restarts.',
    };
    assert.equal(delayed.scheduled, false);
    assert.match(String(delayed.scheduleWarning), /Scheduler unavailable/i);
  });

  it('models successful scheduling', () => {
    const ok: ReminderScheduleResult = { scheduled: true };
    assert.equal(ok.scheduled, true);
    assert.equal(ok.scheduleWarning, undefined);
  });
});
