import type { EventName } from './names';
import { EVENTS_CHANNEL } from './names';
import { eventPayloadSchemas } from './schemas';
import { createRedisClient, ensureRedisConnected } from './redis-client';
import { publishStreamEvent } from './streams';
import type Redis from 'ioredis';

export type DomainEvent<T = unknown> = {
  name: EventName;
  payload: T;
  timestamp: string;
};

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function getPublisher(): Redis | null {
  if (publisher) return publisher;
  try {
    publisher = createRedisClient({ maxRetriesPerRequest: 1 });
    publisher.on('error', () => {
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

  const event: DomainEvent = {
    name,
    payload: parsed,
    timestamp: new Date().toISOString(),
  };

  await publishStreamEvent(name, parsed);

  const client = getPublisher();
  if (!client) return;

  try {
    await ensureRedisConnected(client);
    await client.publish(EVENTS_CHANNEL, JSON.stringify(event));
  } catch {
    /* best-effort — do not break request flow */
  }
}

export function subscribeEvents(
  handler: (event: DomainEvent) => void
): () => void {
  if (subscriber) {
    return () => {
      /* already subscribed */
    };
  }

  subscriber = createRedisClient({ maxRetriesPerRequest: null });
  const sub = subscriber;

  sub.on('error', () => {
    /* best-effort */
  });

  sub.on('message', (_channel, message) => {
    try {
      const event = JSON.parse(message) as DomainEvent;
      handler(event);
    } catch {
      /* ignore malformed */
    }
  });

  void ensureRedisConnected(sub)
    .then(() => sub.subscribe(EVENTS_CHANNEL))
    .catch((err) => {
      console.error('[events] subscribe failed:', err instanceof Error ? err.message : err);
    });

  return () => {
    subscriber = null;
    void sub.quit();
  };
}
