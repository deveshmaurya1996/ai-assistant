import type { FastifyInstance } from 'fastify';
import { config } from '@ai-assistant/config';
import { prisma } from '@ai-assistant/database';
import Redis from 'ioredis';
import { probeIntelligenceHealth } from '../lib/intelligence-readiness';

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
  redis.on('error', (err) => {
    console.warn('[redis:health-probe]', err.message);
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

function registerLivenessRoute(
  app: FastifyInstance,
  path: string,
  body: Record<string, unknown>
): void {
  app.get(path, async () => body);
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  registerLivenessRoute(app, '/', { status: 'ok', service: 'gateway' });
  registerLivenessRoute(app, '/health/live', { status: 'ok', service: 'gateway' });

  app.get('/health/ready', async (_, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'ok' };
    } catch (err) {
      reply.code(503);
      return {
        status: 'degraded',
        database: 'error',
        message: err instanceof Error ? err.message : 'unknown',
      };
    }
  });

  app.get('/health', async (_, reply) => {
    const [python, postgres, redis] = await Promise.all([
      probeIntelligenceHealth(),
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
      probeIntelligenceHealth(),
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
