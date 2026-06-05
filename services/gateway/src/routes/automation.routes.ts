import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, prisma } from '@ai-assistant/database';
import { getConnectorForTool } from '@ai-assistant/integrations';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { isSchedulerReady, scheduleCronJob, scheduleJob } from '../scheduler';
import { badRequest } from '../lib/errors';
import {
  deleteAutomation,
  serializeAutomation,
  updateAutomation,
} from '../services/automation.service';

const AutomationSchema = z.object({
  name: z.string().min(1),
  trigger: z.record(z.string(), z.unknown()),
  action: z.record(z.string(), z.unknown()),
  schedule: z.string().optional(),
  isActive: z.boolean().optional(),
});

const UpdateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  schedule: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  query: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
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
      return reply.send(automations.map(serializeAutomation));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/', async (request, reply) => {
    try {
      if (!isSchedulerReady()) {
        throw badRequest('Scheduler unavailable. Is Redis running?');
      }

      const userId = requireUserId(request);
      const body = AutomationSchema.parse(request.body);

      const action = body.action as { type?: unknown; tool?: unknown };
      if (action?.type === 'agent_digest') {
      } else if (typeof action?.tool === 'string' && action.tool.trim()) {
        const connector = getConnectorForTool(action.tool);
        if (!connector) {
          throw badRequest(`Unknown tool: ${action.tool}`);
        }
        const conn = await prisma.userConnection.findFirst({
          where: { userId, providerId: connector.providerId, status: 'ACTIVE' },
        });
        if (!conn) {
          throw badRequest(
            `No active ${connector.providerId} connection. Connect it in Connect Apps first.`
          );
        }
      }

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
        await scheduleCronJob({
          kind: 'automation',
          entityId: automation.id,
          cron: automation.schedule,
        });
      }

      return reply.code(201).send(serializeAutomation(automation));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const body = UpdateAutomationSchema.parse(request.body);
      const automation = await updateAutomation(userId, id, body);
      return reply.send(automation);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      await deleteAutomation(userId, id);
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/:id/run', async (request, reply) => {
    try {
      if (!isSchedulerReady()) {
        throw badRequest('Scheduler unavailable. Is Redis running?');
      }

      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const automation = await prisma.automation.findFirst({
        where: { id, userId },
      });
      if (!automation) {
        return reply.code(404).send({ error: 'Automation not found' });
      }

      await scheduleJob({
        kind: 'automation',
        entityId: automation.id,
        fireAt: new Date(),
      });
      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
