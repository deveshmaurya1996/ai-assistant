import Redis from 'ioredis';
import { config } from '@ai-assistant/config';

export function createRedisClient(options?: { maxRetriesPerRequest?: number | null }) {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: options?.maxRetriesPerRequest ?? 1,
    lazyConnect: true,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });
  client.on('error', (err) => {
    console.warn('[redis:events]', err.message);  });
  return client;
}

export async function ensureRedisConnected(client: Redis): Promise<void> {
  const status = client.status;
  if (status === 'ready') return;

  if (status === 'connecting') {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        client.off('ready', onReady);
        client.off('error', onError);
      };
      client.once('ready', onReady);
      client.once('error', onError);
    });
    return;
  }

  if (status === 'wait' || status === 'end') {
    await client.connect();
  }
}
