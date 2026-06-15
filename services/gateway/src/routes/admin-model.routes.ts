import { FastifyInstance } from 'fastify';
import { prisma } from '@ai-assistant/database';
import { getAiServiceUrl } from '@ai-assistant/config';
import { authenticateRequest } from '../utils/auth.middleware';
import { sendError } from '../lib/errors';

type OverrideBody = {
  modelId: string;
  enabled?: boolean | null;
  forceTier?: number | null;
  forcePrimary?: boolean;
  quarantined?: boolean;
  maintenanceMode?: boolean;
  priority?: number;
  reason?: string | null;
  expiresAt?: string | null;
};

async function syncRuntimeOverride(body: OverrideBody): Promise<void> {
  try {
    await fetch(getAiServiceUrl('/v1/admin/models/overrides'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: body.modelId,
        enabled: body.enabled ?? undefined,
        forceTier: body.forceTier ?? undefined,
        forcePrimary: body.forcePrimary ?? false,
        quarantined: body.quarantined ?? false,
        maintenanceMode: body.maintenanceMode ?? false,
        priority: body.priority ?? 0,
        reason: body.reason ?? undefined,
        expiresAt: body.expiresAt
          ? Math.floor(new Date(body.expiresAt).getTime() / 1000)
          : undefined,
      }),
    });
  } catch (err) {
    console.warn('[admin-models] runtime sync failed:', err);
  }
}

export async function adminModelRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/models/overrides', async (_, reply) => {
    try {
      const rows = await prisma.modelRuntimeOverride.findMany({
        orderBy: [{ priority: 'desc' }, { modelId: 'asc' }],
      });
      return reply.send({ overrides: rows });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/models/overrides', async (req, reply) => {
    try {
      const body = req.body as OverrideBody;
      if (!body?.modelId) {
        return reply.code(400).send({ error: 'modelId is required' });
      }
      const row = await prisma.modelRuntimeOverride.upsert({
        where: { modelId: body.modelId },
        create: {
          modelId: body.modelId,
          enabled: body.enabled ?? null,
          forceTier: body.forceTier ?? null,
          forcePrimary: body.forcePrimary ?? false,
          quarantined: body.quarantined ?? false,
          maintenanceMode: body.maintenanceMode ?? false,
          priority: body.priority ?? 0,
          reason: body.reason ?? null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
        update: {
          enabled: body.enabled ?? null,
          forceTier: body.forceTier ?? null,
          forcePrimary: body.forcePrimary ?? false,
          quarantined: body.quarantined ?? false,
          maintenanceMode: body.maintenanceMode ?? false,
          priority: body.priority ?? 0,
          reason: body.reason ?? null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      });
      await syncRuntimeOverride(body);
      return reply.send({ ok: true, override: row });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/models/overrides/:modelId', async (req, reply) => {
    try {
      const { modelId } = req.params as { modelId: string };
      await prisma.modelRuntimeOverride.delete({ where: { modelId } }).catch(() => undefined);
      try {
        await fetch(getAiServiceUrl(`/v1/admin/models/overrides/${encodeURIComponent(modelId)}`), {
          method: 'DELETE',
        });
      } catch {
        // best-effort runtime sync
      }
      return reply.send({ ok: true, modelId });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
