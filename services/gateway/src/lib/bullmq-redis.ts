import Redis from 'ioredis';
import { config } from '@ai-assistant/config';

let queueConnection: Redis | null = null;

function attachRedisErrorHandler(client: Redis, scope: string): Redis {
  client.on('error', (err) => {
    console.warn(`[redis:${scope}]`, err.message);
  });
  return client;
}

export function getBullMqQueueConnection(): Redis {
  if (!queueConnection) {
    queueConnection = attachRedisErrorHandler(
      new Redis(config.redisUrl, {
        maxRetriesPerRequest: null,
        connectTimeout: 10_000,
        retryStrategy: (times) => Math.min(times * 200, 5_000),
      }),
      'bullmq-queue'
    );
  }
  return queueConnection;
}

export function createBullMqWorkerConnection(): Redis {
  return attachRedisErrorHandler(
    getBullMqQueueConnection().duplicate(),
    'bullmq-worker'
  );
}
