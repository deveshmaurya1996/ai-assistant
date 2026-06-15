
import Fastify from 'fastify';
import { healthRoutes } from '../dist/routes/health.routes.js';

async function main() {
  const app = Fastify({ logger: false });
  await app.register(healthRoutes);
  await app.ready();

  const hasRoot = app.hasRoute({ method: 'GET', url: '/' });
  const hasLive = app.hasRoute({ method: 'GET', url: '/health/live' });
  const hasHeadRoot = app.hasRoute({ method: 'HEAD', url: '/' });

  if (!hasRoot || !hasLive || !hasHeadRoot) {
    throw new Error('Expected liveness routes were not registered');
  }

  await app.close();
  console.log('gateway health routes smoke test passed');
}

main().catch((err) => {
  console.error('gateway health routes smoke test failed:', err);
  process.exit(1);
});
