import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { badRequest } from '../../lib/errors.js';

function resolveReminderTimezone(params: {
  timezone?: string;
  userPrompt?: string;
}): string {
  const clientTz = params.timezone?.trim();
  if (clientTz) return clientTz;
  if (params.userPrompt?.trim()) {
    throw badRequest(
      'timezone is required for chat-created reminders — use the device timezone from the client'
    );
  }
  return 'UTC';
}

describe('resolveReminderTimezone', () => {
  it('uses client timezone when provided', () => {
    assert.equal(
      resolveReminderTimezone({
        timezone: 'Asia/Kolkata',
        userPrompt: 'remind me at 9pm',
      }),
      'Asia/Kolkata'
    );
  });

  it('rejects chat creates without client timezone', () => {
    assert.throws(
      () =>
        resolveReminderTimezone({
          userPrompt: 'remind me at 9pm',
        }),
      (err: Error) => err.message.includes('timezone is required')
    );
  });

  it('allows UTC fallback only for non-chat automation creates', () => {
    assert.equal(resolveReminderTimezone({ title: 'system job' } as never), 'UTC');
  });
});
