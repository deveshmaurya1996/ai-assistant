import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@ai-assistant/database';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { config as appConfig, getAiServiceUrl } from '@ai-assistant/config';
import { config } from '../lib/http';

const ModelSchema = z.object({
  preferredModel: z.string().min(1),
});

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/models', async (_, reply) => {
    try {
      const res = await fetch(getAiServiceUrl('/v1/models'));
      if (!res.ok) {
        const text = await res.text();
        return reply.code(502).send({ error: 'Failed to load model catalog', details: text });
      }
      const catalog = (await res.json()) as Record<string, unknown>;
      return reply.send({ ...catalog, aiServiceUrl: config.aiServiceUrl });
    } catch (error) {
      return reply.send({
        capabilities: {},
        models: [
          { id: appConfig.primaryModel, label: 'Primary (offline catalog)' },
        ],
        primary: appConfig.primaryModel,
        fallback: appConfig.fallbackModel,
        aiServiceUrl: config.aiServiceUrl,
      });
    }
  });

  fastify.patch('/model', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { preferredModel } = ModelSchema.parse(request.body);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });
      const settings = {
        ...((user?.settings as Record<string, unknown>) ?? {}),
        preferredModel,
      };
      await prisma.user.update({
        where: { id: userId },
        data: { settings: settings as Prisma.InputJsonValue },
      });
      return reply.send({ preferredModel });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
