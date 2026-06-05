import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateStructuredReminderSchedule } from '../schedule-validator.service.js';

describe('validateStructuredReminderSchedule', () => {
  const futureIso = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  it('accepts valid one-shot schedule from chat', () => {
    const nextFireAt = futureIso();
    const result = validateStructuredReminderSchedule(
      {
        title: 'Call mom',
        userPrompt: 'remind me at 9pm to call mom',
        nextFireAt,
        recurrence: 'NONE',
        timezone: 'Asia/Kolkata',
      },
      { chatCreated: true }
    );
    assert.ok(result.title.length > 0);
    assert.equal(result.recurrence, 'NONE');
    assert.equal(result.timezone, 'Asia/Kolkata');
  });

  it('rejects chat create without nextFireAt', () => {
    assert.throws(
      () =>
        validateStructuredReminderSchedule(
          {
            title: 'Water',
            userPrompt: 'remind me every hour',
            recurrence: 'HOURLY',
            timezone: 'UTC',
          },
          { chatCreated: true }
        ),
      /nextFireAt is required/
    );
  });

  it('validates cron for recurring reminders', () => {
    const nextFireAt = futureIso();
    const result = validateStructuredReminderSchedule(
      {
        title: 'Water',
        userPrompt: 'every hour from 9 to 5',
        nextFireAt,
        recurrence: 'CUSTOM',
        cronExpression: '0 9-17 * * *',
        timezone: 'America/New_York',
      },
      { chatCreated: true }
    );
    assert.equal(result.cronExpression, '0 9-17 * * *');
    assert.equal(result.recurrence, 'CUSTOM');
  });

  it('rejects invalid cron', () => {
    assert.throws(
      () =>
        validateStructuredReminderSchedule(
          {
            title: 'Water',
            userPrompt: 'every hour',
            nextFireAt: futureIso(),
            recurrence: 'CUSTOM',
            cronExpression: 'not-a-cron',
            timezone: 'UTC',
          },
          { chatCreated: true }
        ),
      /Invalid cron/
    );
  });

  it('rejects digest-like chat reminders', () => {
    assert.throws(
      () =>
        validateStructuredReminderSchedule(
          {
            title: 'Inbox digest',
            userPrompt: 'check my inbox every 2 hours',
            nextFireAt: futureIso(),
            recurrence: 'CUSTOM',
            cronExpression: '0 */2 * * *',
            timezone: 'UTC',
          },
          { chatCreated: true }
        ),
      /automation task/
    );
  });

  it('normalizes timezone aliases', () => {
    const result = validateStructuredReminderSchedule(
      {
        title: 'Test',
        nextFireAt: futureIso(),
        recurrence: 'NONE',
        timezone: 'ist',
      },
      { chatCreated: false }
    );
    assert.equal(result.timezone, 'Asia/Kolkata');
  });
});
