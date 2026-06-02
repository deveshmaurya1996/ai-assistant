import Fastify from 'fastify';

const PORT = parseInt(process.env.BROWSER_RUNTIME_PORT ?? '3017', 10);

async function main() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'browser-runtime',
    playwright: 'not_configured',
  }));

  app.post('/v1/snapshot', async () => ({
    error: 'Playwright runtime not yet implemented (Phase 9)',
  }));

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[browser-runtime] listening on ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
