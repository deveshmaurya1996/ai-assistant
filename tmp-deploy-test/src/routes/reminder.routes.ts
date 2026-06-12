import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import {
  listReminders,
  getReminder,
  createReminder,
  updateReminder,
  softDeleteReminder,
} from '../services/reminder.service';
import { humanizeCron } from '../scheduler';

const CreateReminderSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  userPrompt: z.string().optional(),
  recurrence: z
    .enum(['NONE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])
    .optional(),
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  nextFireAt: z.string().datetime().optional(),
});

const UpdateReminderSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  userPrompt: z.string().optional(),
  recurrence: z
    .enum(['NONE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])
    .optional(),
  cronExpression: z.string().nullable().optional(),
  timezone: z.string().optional(),
  nextFireAt: z.string().datetime().optional(),
  status: z.enum(['PENDING', 'PAUSED', 'FIRED', 'CANCELLED', 'FAILED']).optional(),
});

export async function reminderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const reminders = await listReminders(userId);
      const enriched = reminders.map((r) => ({
        ...r,
        scheduleLabel:
          r.cronExpression && r.recurrence !== 'NONE'
            ? humanizeCron(r.cronExpression, r.timezone)
            : null,
      }));
      return reply.send(enriched);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const reminder = await getReminder(userId, id);
      return reply.send({
        ...reminder,
        scheduleLabel:
          reminder.cronExpression && reminder.recurrence !== 'NONE'
            ? humanizeCron(reminder.cronExpression, reminder.timezone)
            : null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = CreateReminderSchema.parse(request.body);
      const reminder = await createReminder(userId, body);
      return reply.code(201).send(reminder);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const body = UpdateReminderSchema.parse(request.body);
      const reminder = await updateReminder(userId, id, body);
      return reply.send(reminder);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      await softDeleteReminder(userId, id);
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
