import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@ai-assistant/database';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';

const PushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  deviceId: z.string().optional(),
  prefs: z
    .object({
      reminderOverlayEnabled: z.boolean().optional(),
    })
    .optional(),
});

export async function deviceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.post('/push-token', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = PushTokenSchema.parse(request.body);

      const record = await prisma.devicePushToken.upsert({
        where: { token: body.token },
        create: {
          userId,
          token: body.token,
          platform: body.platform,
          deviceId: body.deviceId,
          prefs: (body.prefs ?? {}) as Prisma.InputJsonValue,
        },
        update: {
          userId,
          platform: body.platform,
          deviceId: body.deviceId,
          prefs: (body.prefs ?? {}) as Prisma.InputJsonValue,
        },
      });

      return reply.send({
        id: record.id,
        token: record.token,
        platform: record.platform,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/push-token', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { token } = (request.body ?? {}) as { token?: string };
      if (!token) {
        return reply.code(400).send({ error: 'token is required' });
      }
      await prisma.devicePushToken.deleteMany({
        where: { userId, token },
      });
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
