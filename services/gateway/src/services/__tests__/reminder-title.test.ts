import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveReminderDisplayTitle } from '../reminder-title.service.js';

describe('deriveReminderDisplayTitle', () => {
  it('cleans user prompt into a short title', () => {
    const title = deriveReminderDisplayTitle(
      'I need you to set a reminder to not touch my nose every 1 min',
      'not touch my nose every 1 min'
    );
    assert.equal(title, "Don't touch your nose");
  });

  it('falls back when prompt is empty', () => {
    assert.equal(deriveReminderDisplayTitle('', 'Call mom'), 'Call mom');
  });

  it('derives drink water from hey can you set every 1 hour', () => {
    const title = deriveReminderDisplayTitle(
      'hey can you set a reminder to drink water every 1 hour'
    );
    assert.equal(title, 'Drink water');
  });

  it('derives drink water from set a reminder without schedule', () => {
    const title = deriveReminderDisplayTitle('set a reminder to drink water');
    assert.equal(title, 'Drink water');
  });
});
