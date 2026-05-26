import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@ai-assistant/database';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { scheduleReminder } from '../workers/reminder.worker';

const ReminderSchema = z.object({
  fireAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export async function reminderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const reminders = await prisma.reminder.findMany({
        where: { userId, status: 'PENDING' },
        orderBy: { fireAt: 'asc' },
      });
      return reply.send(reminders);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = ReminderSchema.parse(request.body);
      const reminder = await prisma.reminder.create({
        data: {
          userId,
          fireAt: new Date(body.fireAt),
          payload: body.payload as Prisma.InputJsonValue,
        },
      });
      await scheduleReminder(reminder.id, reminder.fireAt);
      return reply.code(201).send(reminder);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      await prisma.reminder.updateMany({
        where: { id, userId },
        data: { status: 'CANCELLED' },
      });
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
