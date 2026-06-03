import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toChronologicalOrder } from '../chat-history.service.js';

describe('toChronologicalOrder', () => {
  it('reverses desc-sorted rows to oldest-first', () => {
    const newestFirst = [
      { id: '3', content: 'newest' },
      { id: '2', content: 'mid' },
      { id: '1', content: 'oldest' },
    ];
    const chronological = toChronologicalOrder(newestFirst);
    assert.deepEqual(
      chronological.map((r: { content: string }) => r.content),
      ['oldest', 'mid', 'newest']
    );
  });
});
