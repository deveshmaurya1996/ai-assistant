import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { healthRoutes } from '../health.routes';

describe('healthRoutes', () => {
  it('registers liveness routes without duplicate HEAD handlers', async () => {
    const app = Fastify();
    await app.register(healthRoutes);
    await app.ready();

    assert.equal(app.hasRoute({ method: 'GET', url: '/' }), true);
    assert.equal(app.hasRoute({ method: 'HEAD', url: '/' }), true);
    assert.equal(app.hasRoute({ method: 'GET', url: '/health/live' }), true);
    assert.equal(app.hasRoute({ method: 'HEAD', url: '/health/live' }), true);
    assert.equal(app.hasRoute({ method: 'GET', url: '/health' }), true);
    assert.equal(app.hasRoute({ method: 'GET', url: '/health/ready' }), true);

    await app.close();
  });
});
