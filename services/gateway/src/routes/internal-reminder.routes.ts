import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendError } from '../lib/errors';
import {
  createReminder,
  updateReminder,
  softDeleteReminder,
  findReminderByTitle,
  cancelReminder,
} from '../services/reminder.service';

const InternalCreateSchema = z.object({
  userId: z.string(),
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

const InternalUpdateSchema = z.object({
  userId: z.string(),
  reminderId: z.string().optional(),
  title: z.string().optional(),
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

const InternalCancelSchema = z.object({
  userId: z.string(),
  reminderId: z.string().optional(),
  title: z.string().optional(),
});

export async function internalReminderRoutes(fastify: FastifyInstance) {
  fastify.post('/reminders', async (request, reply) => {
    try {
      const body = InternalCreateSchema.parse(request.body);
      const { userId, ...params } = body;
      const reminder = await createReminder(userId, params);
      return reply.code(201).send(reminder);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/reminders', async (request, reply) => {
    try {
      const body = InternalUpdateSchema.parse(request.body);
      const { userId, reminderId, title, ...params } = body;
      let id = reminderId;
      if (!id && title) {
        const found = await findReminderByTitle(userId, title);
        if (!found) return reply.code(404).send({ error: 'Reminder not found' });
        id = found.id;
      }
      if (!id) return reply.code(400).send({ error: 'reminderId or title required' });
      const reminder = await updateReminder(userId, id, { title, ...params });
      return reply.send(reminder);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/reminders', async (request, reply) => {
    try {
      const body = InternalCancelSchema.parse(request.body);
      const { userId, reminderId, title } = body;
      let id = reminderId;
      if (!id && title) {
        const found = await findReminderByTitle(userId, title);
        if (!found) return reply.code(404).send({ error: 'Reminder not found' });
        id = found.id;
      }
      if (!id) return reply.code(400).send({ error: 'reminderId or title required' });
      await cancelReminder(userId, id);
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
