import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { humanizeCron, normalizeCronForHumanize } from '../cron-utils.js';

describe('normalizeCronForHumanize', () => {
  it('maps 6-field 0/N * * * * * to hourly-style 5-field', () => {
    assert.equal(normalizeCronForHumanize('0/2 * * * * *'), '0 */2 * * *');
  });
});

describe('humanizeCron', () => {
  it('humanizes every 2 hours from mis-encoded 6-field cron', () => {
    assert.equal(humanizeCron('0/2 * * * * *', 'Asia/Kolkata'), 'Every 2 hours');
  });

  it('humanizes standard 5-field hourly cron', () => {
    assert.equal(humanizeCron('0 */2 * * *', 'UTC'), 'Every 2 hours');
  });
});
