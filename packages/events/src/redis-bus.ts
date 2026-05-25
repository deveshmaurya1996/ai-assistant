import Redis from 'ioredis';
import { config } from '@ai-assistant/config';
import type { EventName } from './names';
import { EVENTS_CHANNEL } from './names';
import { eventPayloadSchemas } from './schemas';

export type DomainEvent<T = unknown> = {
  name: EventName;
  payload: T;
  timestamp: string;
};

let publisher: Redis | null = null;

function getPublisher(): Redis | null {
  if (publisher) return publisher;
  try {
    publisher = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    publisher.on('error', () => {
      /* best-effort bus */
    });
    return publisher;
  } catch {
    return null;
  }
}

export async function publishEvent<T extends EventName>(
  name: T,
  payload: unknown
): Promise<void> {
  const schema = eventPayloadSchemas[name];
  const parsed = schema.parse(payload);

  const client = getPublisher();
  if (!client) return;

  const event: DomainEvent = {
    name,
    payload: parsed,
    timestamp: new Date().toISOString(),
  };

  try {
    if (client.status !== 'ready') {
      await client.connect();
    }
    await client.publish(EVENTS_CHANNEL, JSON.stringify(event));
  } catch {
    /* best-effort — do not break request flow */
  }
}

export function subscribeEvents(
  handler: (event: DomainEvent) => void
): () => void {
  const sub = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  sub.subscribe(EVENTS_CHANNEL).catch(() => undefined);

  sub.on('message', (_channel, message) => {
    try {
      const event = JSON.parse(message) as DomainEvent;
      handler(event);
    } catch {
      /* ignore malformed */
    }
  });

  return () => {
    sub.unsubscribe(EVENTS_CHANNEL).catch(() => undefined);
    sub.quit().catch(() => undefined);
  };
}
