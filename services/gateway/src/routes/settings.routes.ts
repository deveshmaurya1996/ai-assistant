import { FastifyInstance } from 'fastify';
import { Prisma, prisma } from '@ai-assistant/database';
import { getAiServiceUrl } from '@ai-assistant/config';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { config } from '../lib/http';
import type { ModelsResponse } from '@ai-assistant/types';

type UserSettings = {
  preferredModelId?: string | null;
  [key: string]: unknown;
};

function readPreferredModelId(settings: unknown): string | undefined {
  if (!settings || typeof settings !== 'object') return undefined;
  const id = (settings as UserSettings).preferredModelId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/models', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const query = request.query as { task?: string };
      const task = query.task?.trim() || 'fast_chat';

      const [selectableRes, user] = await Promise.all([
        fetch(getAiServiceUrl(`/v1/models/selectable?task=${encodeURIComponent(task)}`)),
        prisma.user.findUnique({ where: { id: userId }, select: { settings: true } }),
      ]);

      if (!selectableRes.ok) {
        const text = await selectableRes.text();
        return reply.code(502).send({ error: 'Failed to load model list', details: text });
      }

      const selectable = (await selectableRes.json()) as ModelsResponse & {
        routingOrder?: string[];
        recommendedModelId?: string;
        primaryFromRedis?: string;
        task?: string;
      };

      const preferredModelId = readPreferredModelId(user?.settings);
      const mode = preferredModelId ? 'manual' : selectable.mode ?? 'auto';

      return reply.send({
        ...selectable,
        mode,
        preferredModelId: preferredModelId ?? null,
        aiServiceUrl: config.aiServiceUrl,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/models/preferred', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = request.body as { preferredModelId?: string | null };
      const preferredModelId =
        typeof body.preferredModelId === 'string' && body.preferredModelId.trim()
          ? body.preferredModelId.trim()
          : null;

      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });
      const current =
        existing?.settings && typeof existing.settings === 'object'
          ? { ...(existing.settings as Record<string, unknown>) }
          : {};

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          settings: {
            ...current,
            preferredModelId,
          } as Prisma.InputJsonValue,
        },
        select: { settings: true },
      });

      return reply.send({
        ok: true,
        preferredModelId: readPreferredModelId(user.settings) ?? null,
        mode: preferredModelId ? 'manual' : 'auto',
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
