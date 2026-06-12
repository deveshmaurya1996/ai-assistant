import type { FastifyBaseLogger } from 'fastify';
import Redis from 'ioredis';
import { config } from '@ai-assistant/config';
import { usesRemoteWhatsAppAuth } from '../whatsapp/auth-remote';

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
}

async function checkRedisEvictionPolicy(log: FastifyBaseLogger): Promise<void> {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  try {
    await client.connect();
    const policy = await client.config('GET', 'maxmemory-policy');
    const maxMemoryPolicy = Array.isArray(policy) ? String(policy[1] ?? '') : '';
    if (maxMemoryPolicy && maxMemoryPolicy !== 'noeviction') {
      log.warn(
        {
          maxMemoryPolicy,
          redisUrlHost: safeRedisHost(config.redisUrl),
        },
        'Redis eviction policy is not noeviction — BullMQ jobs may be dropped under memory pressure. Use a Redis plan that supports noeviction (Upstash paid / dedicated Redis).'
      );
    }
  } catch (err) {
    log.debug({ err }, 'Redis eviction policy check skipped');
  } finally {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

function safeRedisHost(redisUrl: string): string {
  try {
    return new URL(redisUrl).host;
  } catch {
    return 'unknown';
  }
}

export async function logProductionReadiness(log: FastifyBaseLogger): Promise<void> {
  if (!isProductionRuntime()) return;

  if (!usesRemoteWhatsAppAuth()) {
    log.warn(
      'WhatsApp auth is stored on local disk only. On Render/ephemeral hosts, signal sessions are lost on redeploy/hibernate and cause MessageCounterError decrypt noise. Configure R2 (STORAGE_BACKEND=r2 + R2_* env) so wa-auth persists.'
    );
  }

  await checkRedisEvictionPolicy(log);
}
