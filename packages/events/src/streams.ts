import type Redis from 'ioredis';
import type { EventName } from './names';
import { EVENTS_STREAM_KEY } from './names';
import { eventPayloadSchemas } from './schemas';
import { createRedisClient, ensureRedisConnected } from './redis-client';

export type DomainEvent<T = unknown> = {
  name: EventName;
  payload: T;
  timestamp: string;
  id?: string;
};

export type StreamConsumerHandler = (event: DomainEvent) => void | Promise<void>;

let publisher: Redis | null = null;

function getPublisher(): Redis | null {
  if (publisher) return publisher;
  try {
    publisher = createRedisClient({ maxRetriesPerRequest: 1 });
    publisher.on('error', () => {
      /* best-effort */
    });
    return publisher;
  } catch {
    return null;
  }
}

export async function publishStreamEvent<T extends EventName>(
  name: T,
  payload: unknown
): Promise<string | null> {
  const schema = eventPayloadSchemas[name];
  const parsed = schema.parse(payload);

  const client = getPublisher();
  if (!client) return null;

  const event: DomainEvent = {
    name,
    payload: parsed,
    timestamp: new Date().toISOString(),
  };

  try {
    await ensureRedisConnected(client);
    const id = await client.xadd(
      EVENTS_STREAM_KEY,
      '*',
      'name',
      event.name,
      'payload',
      JSON.stringify(event.payload),
      'timestamp',
      event.timestamp
    );
    return id;
  } catch {
    return null;
  }
}

export type ConsumerGroupOptions = {
  group: string;
  consumer: string;
  handler: StreamConsumerHandler;
  blockMs?: number;
  count?: number;
};

export function subscribeStreamEvents(options: ConsumerGroupOptions): () => void {
  const { group, consumer, handler, blockMs = 5000, count = 10 } = options;
  const sub = createRedisClient({ maxRetriesPerRequest: null });

  let running = true;

  void (async () => {
    try {
      await ensureRedisConnected(sub);
      try {
        await sub.xgroup('CREATE', EVENTS_STREAM_KEY, group, '0', 'MKSTREAM');
      } catch {
        /* group may already exist */
      }

      while (running) {
        const results = (await sub.xreadgroup(
          'GROUP',
          group,
          consumer,
          'COUNT',
          count,
          'BLOCK',
          blockMs,
          'STREAMS',
          EVENTS_STREAM_KEY,
          '>'
        )) as [string, [string, string[]][]][] | null;

        if (!results) continue;

        for (const entry of results) {
          const messages = entry[1] as [string, string[]][];
          for (const [id, fields] of messages) {
            const fieldMap: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              fieldMap[fields[i]] = fields[i + 1];
            }

            const name = fieldMap.name as EventName;
            const payload = JSON.parse(fieldMap.payload);
            const timestamp = fieldMap.timestamp;

            try {
              await handler({ name, payload, timestamp, id });
              await sub.xack(EVENTS_STREAM_KEY, group, id);
            } catch (err) {
              console.error('[events] consumer handler error:', err);
            }
          }
        }
      }
    } catch (err) {
      if (running) {
        console.error('[events] stream consumer error:', err);
      }
    }
  })();

  return () => {
    running = false;
    void sub.quit();
  };
}
