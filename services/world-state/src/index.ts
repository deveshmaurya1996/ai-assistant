import Fastify from 'fastify';

const PORT = parseInt(process.env.WORLD_STATE_PORT ?? '3016', 10);

async function main() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'world-state' }));

  app.get('/v1/state/:userId', async (request) => {
    const { userId } = request.params as { userId: string };
    return {
      userId,
      user: { working: false, sleeping: false },
      device: { battery: null, network: 'unknown' },
      context: { meeting_active: false },
      workflows: { active: [] },
    };
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[world-state] listening on ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
