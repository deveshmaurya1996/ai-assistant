import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, prisma } from '@ai-assistant/database';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { scheduleAutomation, isAutomationQueueReady } from '../workers/automation.worker';
import { badRequest } from '../lib/errors';

const AutomationSchema = z.object({
  name: z.string().min(1),
  trigger: z.record(z.string(), z.unknown()),
  action: z.record(z.string(), z.unknown()),
  schedule: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function automationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const automations = await prisma.automation.findMany({
        where: { userId },
        include: { runs: { take: 5, orderBy: { startedAt: 'desc' } } },
      });
      return reply.send(automations);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/', async (request, reply) => {
    try {
      if (!isAutomationQueueReady()) {
        throw badRequest('Automation queue unavailable. Is Redis running?');
      }

      const userId = requireUserId(request);
      const body = AutomationSchema.parse(request.body);
      const automation = await prisma.automation.create({
        data: {
          userId,
          name: body.name,
          trigger: body.trigger as Prisma.InputJsonValue,
          action: body.action as Prisma.InputJsonValue,
          schedule: body.schedule,
          isActive: body.isActive ?? true,
        },
      });

      if (automation.schedule && automation.isActive) {
        await scheduleAutomation(automation.id, automation.schedule);
      }

      return reply.code(201).send(automation);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/:id/run', async (request, reply) => {
    try {
      if (!isAutomationQueueReady()) {
        throw badRequest('Automation queue unavailable. Is Redis running?');
      }

      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const automation = await prisma.automation.findFirst({
        where: { id, userId },
      });
      if (!automation) {
        return reply.code(404).send({ error: 'Automation not found' });
      }

      await scheduleAutomation(automation.id, undefined, true);
      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
