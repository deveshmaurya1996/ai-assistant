import Redis from 'ioredis';
import { config } from '@ai-assistant/config';

export function createRedisClient(options?: { maxRetriesPerRequest?: number | null }) {
  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: options?.maxRetriesPerRequest ?? 1,
    lazyConnect: true,
  });
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
