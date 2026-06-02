import Fastify from 'fastify';
import { subscribeEvents, type DomainEvent } from '@ai-assistant/events';

const PORT = parseInt(process.env.EVENT_BUS_PORT ?? '3015', 10);

async function main() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'event-bus' }));

  const recent: DomainEvent[] = [];
  const MAX = 200;

  subscribeEvents((event: DomainEvent) => {
    recent.push(event);
    if (recent.length > MAX) recent.shift();
  });

  app.get('/v1/events/recent', async () => ({ events: recent.slice(-50) }));

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[event-bus] listening on ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
