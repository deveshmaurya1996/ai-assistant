import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, prisma } from '@ai-assistant/database';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { fetchAi } from '../lib/http';

const PreferenceSchema = z.object({
  preferences: z.record(z.string(), z.unknown()),
});

export async function memoryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const items = await prisma.memoryItem.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
      return reply.send(items);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/preferences', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });
      return reply.send(user?.settings ?? {});
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/preferences', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { preferences } = PreferenceSchema.parse(request.body);
      const user = await prisma.user.update({
        where: { id: userId },
        data: { settings: preferences as Prisma.InputJsonValue },
        select: { settings: true },
      });
      return reply.send(user.settings ?? {});
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/search', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const query = (request.query as { q?: string }).q;
      if (!query?.trim()) {
        return reply.code(400).send({ error: 'Query parameter q is required' });
      }

      const data = await fetchAi<{ success: boolean; results: unknown[] }>(
        `/v1/memory/search?query=${encodeURIComponent(query)}&user_id=${userId}&limit=5`
      );
      return reply.send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
