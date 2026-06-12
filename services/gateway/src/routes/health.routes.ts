import type { FastifyInstance } from 'fastify';
import { config } from '@ai-assistant/config';
import { prisma } from '@ai-assistant/database';
import Redis from 'ioredis';

type CheckResult = boolean | { ok: boolean };

async function checkPython(): Promise<boolean> {
  try {
    const base = config.intelligenceUpstreamUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2_000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { service?: string; ai?: boolean };
    return body.service === 'intelligence' && body.ai === true;
  } catch {
    return false;
  }
}

async function checkPostgres(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  } finally {
    redis.disconnect();
  }
}

async function checkQdrant(): Promise<boolean> {
  try {
    const base = config.qdrantUrl.replace(/\/$/, '');
    const apiKey = process.env.QDRANT_API_KEY?.trim();
    const headers: Record<string, string> = {};
    if (apiKey) headers['api-key'] = apiKey;
    const res = await fetch(`${base}/healthz`, {
      signal: AbortSignal.timeout(2_000),
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_, reply) => {
    const [python, postgres, redis] = await Promise.all([
      checkPython(),
      checkPostgres(),
      checkRedis(),
    ]);

    const qdrant = await checkQdrant();

    const criticalOk = postgres && redis && python;
    const status = criticalOk ? (qdrant ? 'ok' : 'degraded') : 'unhealthy';

    const body = {
      status,
      gateway: true,
      python,
      postgres,
      redis,
      qdrant,
    };

    if (!criticalOk) {
      return reply.code(503).send(body);
    }

    return body;
  });

  app.get('/health/detailed', async (_, reply) => {
    const [python, postgres, redis, qdrant] = await Promise.all([
      checkPython(),
      checkPostgres(),
      checkRedis(),
      checkQdrant(),
    ]);

    const criticalOk = postgres && redis && python;
    return reply.code(criticalOk ? 200 : 503).send({
      status: criticalOk ? 'ok' : 'unhealthy',
      gateway: true,
      python,
      postgres,
      redis,
      qdrant,
    });
  });
}
