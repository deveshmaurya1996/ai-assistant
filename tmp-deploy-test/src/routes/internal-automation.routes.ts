import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, prisma } from '@ai-assistant/database';
import { sendError } from '../lib/errors';
import { isSchedulerReady, scheduleCronJob } from '../scheduler';
import { normalizeClientTimezone } from '../services/normalize-client-timezone';
import { validateCronExpression } from '../scheduler/cron-utils';
import { badRequest } from '../lib/errors';
import { normalizeAutomationScheduleInput } from '../lib/automation-input';
import { humanizeAutomationQuery } from '../lib/humanize-automation-query';
import {
  deleteAutomation,
  findAutomationByName,
  listAutomationsForUser,
  serializeAutomation,
  updateAutomation,
} from '../services/automation.service';

const InternalCreateDigestSchema = z
  .object({
    userId: z.string(),
    name: z.string().min(1).optional(),
    schedule: z.string().min(1).optional(),
    cronExpression: z.string().min(1).optional(),
    timezone: z.string().min(1),
    query: z.string().min(1),
    userPrompt: z.string().optional(),
  })
  .refine((body) => Boolean(body.schedule?.trim() || body.cronExpression?.trim()), {
    message: 'schedule or cronExpression is required',
  });

const InternalUpdateSchema = z.object({
  userId: z.string(),
  automationId: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  schedule: z.string().optional(),
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  query: z.string().optional(),
  isActive: z.boolean().optional(),
});

const InternalCancelSchema = z.object({
  userId: z.string(),
  automationId: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
});

export async function internalAutomationRoutes(fastify: FastifyInstance) {
  fastify.get('/automations', async (request, reply) => {
    try {
      const query = z.object({ userId: z.string() }).parse(request.query);
      const automations = await listAutomationsForUser(query.userId);
      return reply.send(automations);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/automations', async (request, reply) => {
    try {
      if (!isSchedulerReady()) {
        return reply.code(503).send({ error: 'Scheduler unavailable. Is Redis running?' });
      }

      const body = InternalCreateDigestSchema.parse(request.body);
      const schedule = normalizeAutomationScheduleInput(body);
      if (!schedule) {
        throw badRequest('schedule or cronExpression is required');
      }
      const timezone = normalizeClientTimezone(body.timezone);
      if (!validateCronExpression(schedule, timezone)) {
        throw badRequest(`Invalid cron expression: ${schedule}`);
      }
      const action = {
        type: 'agent_digest',
        query: humanizeAutomationQuery(body.query, body.userPrompt),
        pushTitle: body.name?.trim() || 'Inbox digest',
        timezone,
        userPrompt: body.userPrompt,
      };

      const automation = await prisma.automation.create({
        data: {
          userId: body.userId,
          name: body.name?.trim() || 'Inbox digest',
          trigger: { type: 'cron' } as Prisma.InputJsonValue,
          action: action as Prisma.InputJsonValue,
          schedule,
          isActive: true,
        },
      });

      await scheduleCronJob({
        kind: 'automation',
        entityId: automation.id,
        cron: automation.schedule!,
        timezone,
      });

      return reply.code(201).send(serializeAutomation(automation));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/automations', async (request, reply) => {
    try {
      const body = InternalUpdateSchema.parse(request.body);
      const { userId, automationId, name, title, schedule, cronExpression, ...rest } = body;
      const lookupName = name?.trim() || title?.trim();
      let id = automationId;
      if (!id && lookupName) {
        const found = await findAutomationByName(userId, lookupName);
        if (!found) return reply.code(404).send({ error: 'Automation not found' });
        id = found.id;
      }
      if (!id) return reply.code(400).send({ error: 'automationId or name required' });

      const automation = await updateAutomation(userId, id, {
        ...(name !== undefined ? { name } : {}),
        schedule,
        cronExpression,
        ...rest,
      });
      return reply.send(automation);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/automations', async (request, reply) => {
    try {
      const body = InternalCancelSchema.parse(request.body);
      const { userId, automationId, name, title } = body;
      const lookupName = name?.trim() || title?.trim();
      let id = automationId;
      if (!id && lookupName) {
        const found = await findAutomationByName(userId, lookupName);
        if (!found) return reply.code(404).send({ error: 'Automation not found' });
        id = found.id;
      }
      if (!id) return reply.code(400).send({ error: 'automationId or name required' });
      await deleteAutomation(userId, id);
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
