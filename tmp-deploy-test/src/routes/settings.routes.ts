import { FastifyInstance } from 'fastify';
import { getAiServiceUrl } from '@ai-assistant/config';
import { authenticateRequest } from '../utils/auth.middleware';
import { sendError } from '../lib/errors';
import { config } from '../lib/http';

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.get('/models', async (_, reply) => {
    try {
      const res = await fetch(getAiServiceUrl('/v1/models'));
      if (!res.ok) {
        const text = await res.text();
        return reply.code(502).send({ error: 'Failed to load model catalog', details: text });
      }
      const catalog = (await res.json()) as Record<string, unknown>;
      return reply.send({ ...catalog, aiServiceUrl: config.aiServiceUrl });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
