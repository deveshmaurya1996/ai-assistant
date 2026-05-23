import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, prisma } from '@ai-assistant/database';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { fetchAi } from '../lib/http';

const AgentConfigSchema = z.object({
  agentType: z.enum(['email', 'calendar', 'browser']),
  credentials: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().optional(),
});

const AgentRunSchema = z.object({
  agentType: z.enum(['email', 'calendar', 'browser']),
  task: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/config', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const configs = await prisma.agentConfig.findMany({ where: { userId } });
      return reply.send(configs);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/config', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = AgentConfigSchema.parse(request.body);
      const existing = await prisma.agentConfig.findFirst({
        where: { userId, agentType: body.agentType },
      });

      const row = existing
        ? await prisma.agentConfig.update({
            where: { id: existing.id },
            data: {
              credentials: body.credentials as Prisma.InputJsonValue,
              isActive: body.isActive ?? true,
            },
          })
        : await prisma.agentConfig.create({
            data: {
              userId,
              agentType: body.agentType,
              credentials: body.credentials as Prisma.InputJsonValue,
              isActive: body.isActive ?? true,
            },
          });

      return reply.code(201).send(row);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/run', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = AgentRunSchema.parse(request.body);
      const data = await fetchAi('/v1/agents/run', {
        method: 'POST',
        body: JSON.stringify({
          agent_type: body.agentType,
          task: body.task,
          context: body.context ?? {},
          user_id: userId,
        }),
      });
      return reply.send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
