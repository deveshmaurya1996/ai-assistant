import Fastify from 'fastify';

const PORT = parseInt(process.env.REFLECTION_ENGINE_PORT ?? '3019', 10);

async function main() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'reflection-engine' }));

  app.post('/v1/reflect', async (request) => {
    const body = request.body as { action: string; result?: unknown };
    return {
      valid: true,
      suggestions: [],
      note: `Reflection stub for action: ${body.action}`,
    };
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[reflection-engine] listening on ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
