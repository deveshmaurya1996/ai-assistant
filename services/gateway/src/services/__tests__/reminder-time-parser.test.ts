import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseReminderSchedule } from '../reminder-time-parser.service.js';

describe('parseReminderSchedule', () => {
  it('parses every weekday', () => {
    const result = parseReminderSchedule(
      {
        title: 'Drink water',
        userPrompt: 'Remind me every weekday at 8am to drink water',
        nextFireAt: '2026-06-06T02:30:00.000Z',
        timezone: 'UTC',
      },
      'UTC'
    );
    assert.equal(result.recurrence, 'CUSTOM');
    assert.match(result.cronExpression ?? '', /1-5/);
  });

  it('parses every minute', () => {
    const result = parseReminderSchedule(
      {
        title: "Don't touch your nose",
        userPrompt: 'I need you to set a reminder to not touch my nose every 1 min',
        timezone: 'UTC',
      },
      'UTC'
    );
    assert.equal(result.recurrence, 'CUSTOM');
    assert.equal(result.cronExpression, '* * * * *');
    assert.equal(result.title, "Don't touch your nose");
  });

  it('parses every 1 hour as hourly', () => {
    const result = parseReminderSchedule(
      {
        title: 'Drink water',
        userPrompt: 'hey can you set a reminder to drink water every 1 hour',
        timezone: 'UTC',
      },
      'UTC'
    );
    assert.equal(result.recurrence, 'HOURLY');
    assert.equal(result.cronExpression, '0 * * * *');
    assert.equal(result.title, 'Drink water');
  });

  it('parses every 2 hours as custom cron', () => {
    const result = parseReminderSchedule(
      {
        title: 'Drink water',
        userPrompt: 'remind me to drink water every 2 hours',
        timezone: 'UTC',
      },
      'UTC'
    );
    assert.equal(result.recurrence, 'CUSTOM');
    assert.equal(result.cronExpression, '0 */2 * * *');
  });

  it('defaults to one-shot when no recurrence cues', () => {
    const result = parseReminderSchedule(
      {
        title: 'Call mom',
        nextFireAt: '2026-06-06T15:00:00.000Z',
      },
      'UTC'
    );
    assert.equal(result.recurrence, 'NONE');
    assert.equal(result.cronExpression, null);
  });
});
