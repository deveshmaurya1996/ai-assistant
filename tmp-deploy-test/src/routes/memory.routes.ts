import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, prisma } from '@ai-assistant/database';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { fetchAi } from '../lib/http';
import { deleteMemoryItem, listMemoryItemsForUser } from '../services/memory.service';
import type { MemoryType } from '@ai-assistant/types';

const PreferenceSchema = z.object({
  preferences: z.record(z.string(), z.unknown()),
});

export async function memoryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const query = request.query as { type?: string; includeConversations?: string };
      const typeParam = query.type?.trim();
      const allowed: MemoryType[] = ['FACT', 'PREFERENCE', 'CONVERSATION', 'TASK', 'BEHAVIOR'];
      const typeFilter =
        typeParam && allowed.includes(typeParam as MemoryType)
          ? (typeParam as MemoryType)
          : undefined;
      const includeConversations =
        typeFilter
          ? false
          : query.includeConversations === 'true' || query.includeConversations === '1';

      const items = await listMemoryItemsForUser(userId, {
        type: typeFilter,
        includeConversations,
        take: 50,
      });
      return reply.send(items);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const ok = await deleteMemoryItem(userId, id);
      if (!ok) {
        return reply.code(404).send({ error: 'Memory item not found' });
      }
      return reply.send({ success: true });
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
        `/v1/memory/search?query=${encodeURIComponent(query)}&user_id=${userId}&limit=5`,
        { timeoutMs: 8_000 }
      );
      return reply.send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
