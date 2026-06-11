import Fastify from 'fastify';
import { config } from '@ai-assistant/config';

const PORT = parseInt(process.env.WORKFLOW_ENGINE_PORT ?? '3020', 10);

async function main() {
  const app = Fastify({ logger: true });
  const temporalAddress = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  const temporalEnabled = process.env.TEMPORAL_ENABLED === 'true';

  app.get('/health', async () => ({
    status: 'ok',
    service: 'workflow-engine',
    temporal: temporalEnabled ? 'configured' : 'stub',
    temporalAddress,
    capabilityRuntimeUrl: config.capabilityRuntimeUrl,
  }));

  app.post('/v1/workflows/register', async (request) => {
    const body = request.body as { name: string; definition?: unknown };
    return {
      registered: true,
      name: body.name,
      note: temporalEnabled
        ? 'Temporal worker should process this registration'
        : 'Set TEMPORAL_ENABLED=true and run Temporal server to activate',
    };
  });

  if (temporalEnabled) {
    app.log.info('Temporal enabled — implement worker in src/temporal-worker.ts');
  }

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[workflow-engine] listening on ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
