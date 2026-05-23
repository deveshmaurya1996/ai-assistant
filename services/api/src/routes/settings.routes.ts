import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@ai-assistant/database';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { config as appConfig } from '@ai-assistant/config';
import { config } from '../lib/http';

const ModelSchema = z.object({
  preferredModel: z.string().min(1),
});

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/models', async () => ({
    models: [
      { id: 'gemini/gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'ollama/llama3.2', label: 'Ollama Llama 3.2' },
    ],
    primary: appConfig.primaryModel,
    fallback: appConfig.fallbackModel,
    aiServiceUrl: config.aiServiceUrl,
  }));

  fastify.patch('/model', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { preferredModel } = ModelSchema.parse(request.body);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });
      const settings = {
        ...((user?.settings as Record<string, unknown>) ?? {}),
        preferredModel,
      };
      await prisma.user.update({
        where: { id: userId },
        data: { settings: settings as Prisma.InputJsonValue },
      });
      return reply.send({ preferredModel });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
