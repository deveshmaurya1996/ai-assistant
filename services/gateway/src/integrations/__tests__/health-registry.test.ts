import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessProviderHealth } from '../health-registry.js';

describe('assessProviderHealth', () => {
  it('returns unhealthy when no adapter is registered', async () => {
    const result = await assessProviderHealth({
      userId: 'user-1',
      connection: { id: 'conn-1', providerId: 'unknown-provider', status: 'ACTIVE' },
    });
    assert.equal(result.healthy, false);
    assert.match(result.error ?? '', /No health adapter/);
  });
});
